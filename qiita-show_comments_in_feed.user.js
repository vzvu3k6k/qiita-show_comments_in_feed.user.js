// ==UserScript==
// @name           Qiita: Show comments in feed
// @description    When a post is opened in feed, inserts comments for it
// @version        0.4
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

    /* Quit if comments has already been inserted  */
    if(target.querySelector('.js-comments')) return;

    /*
     Just add a 'Write a comment' button if there are no comments
     to reduce requests
     */
    var $faComment = target.querySelector('.fa-comment-o');
    if($faComment === null ||
       $faComment.parentNode.textContent.trim() === '0' /* for /public */
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

  /*
   Comments for a specified post can be retrieved with Qiita API v2.
   However, the API response doesn't give comments rendered as HTML,
   but Qiita markdown texts.
   So I choose to scrape comments from a HTML page.
   */
  function insertComment($itemBox){
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
      try{
        new Qiita.views.items.CommentListView({
          el: $comments.querySelector('.js-comments'),
          collection: item.comments,
          enableAsyncPost: false
        });
      }catch(e){ }

      /* Enable the new comment form */
      var $$newComment = $comments.querySelector('.js-new-comment');
      try{
        new Qiita.views.items.NewCommentView({
          el: $$newComment,
          collection: item.comments,
          enableAsyncPost: false
        });
      }catch(e){
        $$newComment.style.display = 'none';
      }

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
} + ')()';
