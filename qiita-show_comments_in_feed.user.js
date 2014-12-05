// ==UserScript==
// @name           Qiita: Show comments in feed
// @description    When a post is opened in feed, inserts comments for it
// @version        0.1
// @author         vzvu3k6k
// @match          http://qiita.com/
// @match          http://qiita.com/public
// @match          http://qiita.com/stock
// @match          http://qiita.com/mine
// @namespace      http://vzvu3k6k.tk/
// @license        CC0
// ==/UserScript==

location.href = 'javascript:void(' + function(){
  document.addEventListener('click', function(event){
    if(!event.target.classList.contains('expand')) return;

    var target = event.target;
    while(1){
      if(target === document.documentElement) return;
      if(target.classList.contains('item-box')) break;
      target = target.parentNode;
    }
    insertComment(target);
  });

  /*
   Comments for a specified post can be retrieved with Qiita API v2.
   However, the API response doesn't give comments rendered as HTML,
   but Qiita markdown texts.
   So I choose to scrape comments from a HTML page.
   */
  function insertComment($itemBox){
    /* Quit if comments has already been inserted  */
    if($itemBox.querySelector('.js-comments')) return;

    /* Quit if there are no comments */
    var $faComment = $itemBox.querySelector('.fa-comment-o');
    if($faComment === null ||
       $faComment.parentNode.textContent.trim() === '0' /* for /public */ )
      return;

    var xhr = new XMLHttpRequest();
    var itemUrl = $itemBox.querySelector('.item-box-title a').href;
    xhr.open('GET', itemUrl);
    xhr.onload = function(){
      if(xhr.status !== 200) return;

      var responseDocument = xhr.responseXML;
      var $comments = responseDocument.querySelector('#comments');
      $comments.removeAttribute('id');

      /* Fix relative links */
      Array.prototype.forEach.call(
        $comments.querySelectorAll('a'),
        function(i){
          i.setAttribute('href', i.href);
        }
      );

      $itemBox.querySelector('.item-body-wrapper').appendChild($comments);

      var item = new Qiita.models.Item(
        _.parse(responseDocument.querySelector('#js-item').textContent)
      );

      /* Enable "Thank" buttons */
      new Qiita.views.items.CommentListView({
        el: $comments.querySelector('.js-comments'),
        collection: item.comments,
        enableAsyncPost: !1
      });

      /* Enable the new comment form */
      new Qiita.views.items.NewCommentView({
        el: $comments.querySelector('.js-new-comment'),
        collection: item.comments,
        enableAsyncPost: !1
      });
    };
    xhr.responseType = 'document';
    xhr.send();
  }
} + ')()';
