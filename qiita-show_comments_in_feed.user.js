// ==UserScript==
// @name           Qiita: Show comments in feed
// @description    When a post is opened in feed, inserts comments for it
// @version        0.2
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

      /* Enable/Disable the new comment form */
      var $$newComment = $comments.querySelector('.js-new-comment');
      try{
        if(!enableNewCommentForm) throw 'new comment form is disabled';

        var newCommentView = new Qiita.views.items.NewCommentView({
          el: $$newComment,
          collection: item.comments,
          enableAsyncPost: false
        });

        /*
         Absolutify action URL.
         As `action` is either `/comments` or `/comments/{id}`
         for now, this is not necessary.
         Added as a precaution.
         */
        var actionUrl = (function(){
          var a = responseDocument.createElement('a');
          a.setAttribute('href', newCommentView.formView.$el.attr('action'));
          return a.href;
        })();

        newCommentView.formView.$el.submit = function(){
          jQuery.post(actionUrl, newCommentView.formView.$el.serialize(), null, 'html')
            .then(null, function(){
              Qiita.notification.error('[UserScript: Qiita: Show comments in feed] Fail to submit.');
              return jQuery.Deferred(); /* Cancel following chains */
            }).done(function(){
              /* Rebuild comments */
              $comments.remove();
              insertComment($itemBox);
            }).fail(function(){
              Qiita.notification.error('[UserScript: Qiita: Show comments in feed] Fail to render comments.');
            });
        };
      }catch(e){
        $$newComment.style.display = 'none';
      }
    };
    xhr.responseType = 'document';
    xhr.send();
  }

  /* Check roughly if relevant codes are not changed */
  var enableNewCommentForm = false;
  try{
    enableNewCommentForm = [
      ['Qiita.views.items.NewCommentView.prototype.initialize', 153],
      ['Qiita.views.items.NewCommentView.prototype.resetFormView', 232],
      ['Qiita.views.items.CommentFormView.prototype.onClickSubmit', 53],
      ['Qiita.views.items.CommentFormView.prototype.submit', 177]
    ].all(function(i){
      return eval(i[0]).toString().length === i[1];
    });
  }catch(e){ }

} + ')()';
