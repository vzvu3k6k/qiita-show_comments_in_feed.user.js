// ==UserScript==
// @name           Qiita: Show comments in feed
// @description    When a post is opened in feed, inserts comments for it
// @version        0.4
// @author         vzvu3k6k
// @match          http://qiita.com/
// @match          http://qiita.com/public
// @match          http://qiita.com/stock
// @match          http://qiita.com/mine
// @grant          none
// @run-at         document-end
// @namespace      http://vzvu3k6k.tk/
// @license        CC0
// ==/UserScript==

/* global I18n */

// Qiita uses browserify and we can't access its view or model modules directly.
// Instead we get them by intercepting a browserify function call.
function ModuleCollector() {
  this.originalCall = window.Function.prototype.call;
  this.callWithTrap = this.getTrapCall();
  this.modules = [];
  this.exports = [];
}
ModuleCollector.prototype.getTrapCall = function getTrapCall() {
  let prevModules;
  const self = this;
  return function trapCall(...args) {
    self.disable(); // Avoid infinite recursion

    // Function.prototype.toString() of Chromium keeps spaces,
    // but that of Firefox normalizes spaces like `function (require,module,exports)`.
    const funcPattern = /^function\s*\(require,\s*module,\s*exports\)/;
    if (funcPattern.test(this.toString())) {
      if (prevModules !== args[5]) {
        prevModules = args[5];
        self.modules.push(args[5]);
        self.exports.push(args[6]);
      }
    }

    const retval = this.apply(args[0], args.slice(1));
    self.enable();
    return retval;
  };
};
ModuleCollector.prototype.enable = function enable() {
  Object.defineProperty(
    window.Function.prototype,
    'call',
    {
      value: this.callWithTrap,
      configurable: true,
    }
  );
};
ModuleCollector.prototype.disable = function disable() {
  Object.defineProperty(
    window.Function.prototype,
    'call',
    {
      value: this.originalCall,
      configurable: true,
    }
  );
};
ModuleCollector.prototype.getRequire = function getRequire(index) {
  const modules = this.modules[index];
  const exports = this.exports[index];
  const moduleMap = {};
  for (const key of Object.keys(modules)) {
    const paths = modules[key][1];
    for (const path of Object.keys(paths)) {
      moduleMap[path] = paths[path];
    }
  }
  return (path) => {
    const module = exports[moduleMap[path]];
    if (module && module.exports) {
      return module.exports;
    }
    throw new Error(`[UserScript - Qiita: Show comments in feed] Cannot find module ${path}`);
  };
};

const moduleCollector = new ModuleCollector();
moduleCollector.enable();

window.addEventListener('load', () => {
  moduleCollector.disable();
  const require = moduleCollector.getRequire(0);

  document.addEventListener('click', (event) => {
    if (!event.target.classList.contains('expand')) return;

    let target = event.target;
    for (;;) {
      if (target === document.documentElement) return;
      if (target.classList.contains('item-box')) break;
      target = target.parentNode;
    }

    // Quit if comments has already been inserted
    if (target.querySelector('.js-comments')) return;

    // Just add a 'Write a comment' button if there are no comments
    // to reduce requests
    const $faComment = target.querySelector('.fa-comment-o');
    if ($faComment === null ||
       $faComment.parentNode.textContent.trim() === '0' // for /public
      ) {
      insertWriteCommentButton(target); // eslint-disable-line no-use-before-define
      return;
    }

    insertComment(target); // eslint-disable-line no-use-before-define
  });

  function insertWriteCommentButton($itemBox) {
    const $button = document.createElement('a');
    $button.setAttribute('class', 'btn btn-primary');
    $button.setAttribute('href', '#comments');
    $button.textContent = I18n.lookup('js.item_box.comment') || 'Comment';
    $button.addEventListener('click', () => {
      $button.remove();
      insertComment($itemBox); // eslint-disable-line no-use-before-define
    });
    $itemBox.querySelector('.item-body-wrapper').appendChild($button);
  }

  // Comments for a specified post can be retrieved with Qiita API v2.
  // However, the API response doesn't give comments rendered as HTML,
  // but Qiita markdown texts.
  // So I choose to scrape comments from a HTML page.
  function insertComment($itemBox) {
    const xhr = new XMLHttpRequest();
    const itemUrl = $itemBox.querySelector('.item-box-title a').href;
    xhr.open('GET', itemUrl);
    xhr.onload = () => {
      if (xhr.status !== 200) return;

      const responseDocument = xhr.responseXML;
      const $comments = responseDocument.querySelector('#comments');
      $comments.removeAttribute('id');

      // Fix relative links
      Array.prototype.forEach.call(
        $comments.querySelectorAll('a'),
        (i) => {
          i.setAttribute('href', i.href);
        }
      );

      $itemBox.querySelector('.item-body-wrapper').appendChild($comments);

      const item = new (require('../models/item'))(
        JSON.parse(responseDocument.querySelector('#js-item').textContent)
      );

      // Enable "Thank" buttons
      try {
        new (require('../views/items/comment_list_view'))({ // eslint-disable-line no-new
          el: $comments.querySelector('.js-comments'),
          collection: item.comments,
          enableAsyncPost: false,
        });
      } catch (e) {
        for (const btn of $comments.querySelectorAll('.js-thank-btn')) {
          btn.style.display = 'none';
        }
      }

      // Enable the new comment form
      const $$newComment = $comments.querySelector('.js-new-comment');
      try {
        new (require('../views/items/new_comment_view'))({ // eslint-disable-line no-new
          el: $$newComment,
          collection: item.comments,
          enableAsyncPost: false,
        });
      } catch (e) {
        $$newComment.style.display = 'none';
      }

      // Open a new window when posting or deleting a comment
      Array.prototype.forEach.call(
        $comments.querySelectorAll(
          '.commentHeader_deleteButton a, form'
        ),
        (i) => {
          i.setAttribute('target', '_blank');
        }
      );
    };
    xhr.responseType = 'document';
    xhr.send();
  }
});
