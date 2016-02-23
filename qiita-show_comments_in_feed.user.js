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

function ItemBox(require, $itemBox) {
  this.require = require;
  this.$el = $itemBox;
}
ItemBox.isExpandButton = function isExpandButton($target) {
  return $target.matches('.item-box .expand');
};
ItemBox.prototype.insert = function insert() {
  // Just add a 'Write a comment' button if there are no comments
  // to reduce requests
  const $faComment = this.$el.querySelector('.fa-comment-o');
  if ($faComment === null ||
      $faComment.parentNode.textContent.trim() === '0' // for /public
     ) {
    this.insertWriteCommentButton();
    return;
  }

  this.insertComment();
};
ItemBox.prototype.insertWriteCommentButton = function insertWriteCommentButton() {
  const $button = document.createElement('a');
  $button.setAttribute('class', 'btn btn-primary __comment-btn');
  $button.setAttribute('href', `${this.getArticleUrl()}#comments`);
  $button.textContent = I18n.lookup('js.item_box.comment') || 'Comment';
  $button.addEventListener('click', (event) => {
    event.preventDefault();
    $button.remove();
    this.insertComment();
  });
  this.$el.querySelector('.item-body-wrapper').appendChild($button);
};
ItemBox.prototype.insertComment = function insertComment() {
  // Comments for a specified post can be retrieved with Qiita API v2.
  // However, the API response doesn't give comments rendered as HTML,
  // but Qiita markdown texts.
  // So I choose to scrape comments from a HTML page.
  const xhr = new XMLHttpRequest();
  xhr.open('GET', this.getArticleUrl());
  xhr.onload = () => {
    if (xhr.status !== 200) return;

    const responseDocument = xhr.responseXML;
    const $comments = responseDocument.querySelector('#comments');
    $comments.removeAttribute('id');

    // Fix relative links
    for (const $link of $comments.querySelectorAll('a')) {
      $link.setAttribute('href', $link.href);
    }

    this.$el.querySelector('.item-body-wrapper').appendChild($comments);

    const item = new (this.require('../models/item'))(
      JSON.parse(responseDocument.querySelector('#js-item').textContent)
    );

    // Enable "Thank" buttons
    try {
      new (this.require('../views/items/comment_list_view'))({ // eslint-disable-line no-new
        el: $comments.querySelector('.js-comments'),
        collection: item.comments,
        enableAsyncPost: false,
      });
    } catch (e) {
      for (const $btn of $comments.querySelectorAll('.js-thank-btn')) {
        $btn.style.display = 'none';
      }
    }

    // Enable the new comment form
    const $newComment = $comments.querySelector('.js-new-comment');
    try {
      new (this.require('../views/items/new_comment_view'))({ // eslint-disable-line no-new
        el: $newComment,
        collection: item.comments,
        enableAsyncPost: false,
      });
    } catch (e) {
      $newComment.style.display = 'none';
    }

    // Open a new window when posting or deleting a comment
    for (const $el of $comments.querySelectorAll('.commentHeader_deleteButton a, form')) {
      $el.setAttribute('target', '_blank');
    }
  };
  xhr.responseType = 'document';
  xhr.send();
};
ItemBox.prototype.getArticleUrl = function getTitleLink() {
  return this.$el.querySelector('.item-box-title a').href;
};
ItemBox.prototype.isInserted = function isInserted() {
  return !!this.$el.querySelector('.js-comments, .__comment-btn');
};

const moduleCollector = new ModuleCollector();
moduleCollector.enable();

window.addEventListener('load', () => {
  moduleCollector.disable();
  const require = moduleCollector.getRequire(0);

  document.addEventListener('click', (event) => {
    if (!ItemBox.isExpandButton(event.target)) return;

    let $target = event.target;
    for (;;) {
      if ($target === document.documentElement) return;
      if ($target.classList.contains('item-box')) break;
      $target = $target.parentNode;
    }

    const itemBox = new ItemBox(require, $target);
    if (!itemBox.isInserted()) {
      itemBox.insert();
    }
  });
});
