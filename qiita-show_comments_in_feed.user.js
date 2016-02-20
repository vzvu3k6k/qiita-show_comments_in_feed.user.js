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

// Qiita uses browserify and we can't access its view or model modules directly.
// Instead we get them by intercepting a browserify function call.
function ModuleCollector() {
  this.originalCall = window.Function.prototype.call;
  this.callWithTrap = this.getTrapCall();
  this.modules = [];
  this.exports = [];
}
ModuleCollector.prototype.getTrapCall = function() {
  let prevModules;
  let self = this;
  return function() {
    self.disable(); // Avoid infinite recursion

    // Function.prototype.toString() of Chromium keeps spaces,
    // but that of Firefox normalizes spaces like `function (require,module,exports)`.
    var funcPattern = /^function\s*\(require,\s*module,\s*exports\)/;
    if (funcPattern.test(this.toString())) {
      if (prevModules !== arguments[5]) {
        prevModules = arguments[5];
        self.modules.push(arguments[5]);
        self.exports.push(arguments[6]);
      }
    }

    var retval = this.apply(arguments[0], Array.from(arguments).slice(1));
    self.enable();
    return retval;
  };
};
ModuleCollector.prototype.enable = function() {
  Object.defineProperty(
    window.Function.prototype,
    'call',
    {
      value: this.callWithTrap,
      configurable: true,
    }
  );
};
ModuleCollector.prototype.disable = function() {
  Object.defineProperty(
    window.Function.prototype,
    'call',
    {
      value: this.originalCall,
      configurable: true,
    }
  );
};
ModuleCollector.prototype.getRequire = function(index) {
  let modules = this.modules[index];
  let exports = this.exports[index];
  let moduleMap = {};
  for (let key of Object.keys(modules)) {
    let paths = modules[key][1];
    for (let path of Object.keys(paths)) {
      moduleMap[path] = paths[path];
    }
  }
  return (path) => {
    let module = exports[moduleMap[path]];
    if (module && module.exports) {
      return module.exports;
    } else {
      throw new Error(`[UserScript - Qiita: Show comments in feed] Cannot find module ${path}`);
    }
  };
};

let moduleCollector = new ModuleCollector();
moduleCollector.enable();

window.addEventListener('load', () => {
  moduleCollector.disable();
  let require = moduleCollector.getRequire(0);

  document.addEventListener('click', function(event){
    if(!event.target.classList.contains('expand')) return;

    var target = event.target;
    while(1){
      if(target === document.documentElement) return;
      if(target.classList.contains('item-box')) break;
      target = target.parentNode;
    }

    // Quit if comments has already been inserted
    if(target.querySelector('.js-comments')) return;

    // Just add a 'Write a comment' button if there are no comments
    // to reduce requests
    var $faComment = target.querySelector('.fa-comment-o');
    if($faComment === null ||
       $faComment.parentNode.textContent.trim() === '0' // for /public
      ){
        insertWriteCommentButton(target);
        return;
      }

    insertComment(target);
  });

  function insertWriteCommentButton($itemBox){
    var $button = document.createElement('a');
    $button.setAttribute('class', 'btn btn-primary');
    $button.setAttribute('href', 'javascript:void(0)');
    $button.textContent = I18n.lookup('js.item_box.comment') || 'Comment';
    $button.addEventListener('click', function(event){
      $button.remove();
      insertComment($itemBox);
    });
    $itemBox.querySelector('.item-body-wrapper').appendChild($button);
  }

  // Comments for a specified post can be retrieved with Qiita API v2.
  // However, the API response doesn't give comments rendered as HTML,
  // but Qiita markdown texts.
  // So I choose to scrape comments from a HTML page.
  function insertComment($itemBox){
    var xhr = new XMLHttpRequest();
    var itemUrl = $itemBox.querySelector('.item-box-title a').href;
    xhr.open('GET', itemUrl);
    xhr.onload = function(){
      if(xhr.status !== 200) return;

      var responseDocument = xhr.responseXML;
      var $comments = responseDocument.querySelector('#comments');
      $comments.removeAttribute('id');

      // Fix relative links
      Array.prototype.forEach.call(
        $comments.querySelectorAll('a'),
        function(i){
          i.setAttribute('href', i.href);
        }
      );

      $itemBox.querySelector('.item-body-wrapper').appendChild($comments);

      var item = new (require('../models/item'))(
        JSON.parse(responseDocument.querySelector('#js-item').textContent)
      );

      // Enable "Thank" buttons
      try{
        new (require('../views/items/comment_list_view'))({
          el: $comments.querySelector('.js-comments'),
          collection: item.comments,
          enableAsyncPost: false
        });
      }catch(e){
        for (let btn of $comments.querySelectorAll('.js-thank-btn')) {
          btn.style.display = 'none';
        }
      }

      // Enable the new comment form
      var $$newComment = $comments.querySelector('.js-new-comment');
      try{
        new (require('../views/items/new_comment_view'))({
          el: $$newComment,
          collection: item.comments,
          enableAsyncPost: false
        });
      }catch(e){
        $$newComment.style.display = 'none';
      }

      // Open a new window when posting or deleting a comment
      Array.prototype.forEach.call(
        $comments.querySelectorAll(
          '.commentHeader_deleteButton a, form'
        ),
        function(i){
          i.setAttribute('target', '_blank');
        }
      );
    };
    xhr.responseType = 'document';
    xhr.send();
  }
});
