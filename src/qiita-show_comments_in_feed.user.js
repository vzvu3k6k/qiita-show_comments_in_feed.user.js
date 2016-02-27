// ==UserScript==
// @name           Qiita: Show comments in feed
// @description    When a post is opened in feed, inserts comments for it
// @version        0.6.0
// @author         vzvu3k6k
// @match          http://qiita.com/
// @match          http://qiita.com/items
// @match          http://qiita.com/stock
// @match          http://qiita.com/mine
// @grant          none
// @run-at         document-end
// @noframes
// @namespace      http://vzvu3k6k.tk/
// @license        CC0-1.0
// ==/UserScript==

/* global I18n */

class ItemBox {
  constructor(require, $itemBox) {
    this.require = require;
    this.$el = $itemBox;
  }

  insert() {
    // Just add a 'Write a comment' button if there are no comments
    // to reduce requests
    const $faComment = this.$el.querySelector('.fa-comment-o');
    if ($faComment === null ||
        $faComment.parentNode.textContent.trim() === '0' // for /items
       ) {
      this.insertWriteCommentButton();
      return;
    }

    this.insertComment();
  }

  insertWriteCommentButton() {
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
  }

  insertComment() {
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
  }

  getArticleUrl() {
    return this.$el.querySelector('.item-box-title a').href;
  }

  isInserted() {
    return !!this.$el.querySelector('.js-comments, .__comment-btn');
  }

  static isExpandButton($target) {
    return $target.matches('.item-box .expand');
  }

  static findItemBoxNode($start) {
    for (let $target = $start; ;) {
      if ($target === document.documentElement) return null;
      if ($target.classList.contains('item-box')) return $target;
      $target = $target.parentNode;
    }
  }
}

// Qiita uses browserify and we can't access its view or model modules directly.
const Conjurify = require('@vzvu3k6k/conjurify');
const conjurify = new Conjurify(window);
conjurify.setTrap();

window.addEventListener('load', () => {
  conjurify.removeTrap();
  const require = conjurify.getRequire();

  document.addEventListener('click', (event) => {
    if (!ItemBox.isExpandButton(event.target)) return;

    const $itemBox = ItemBox.findItemBoxNode(event.target);
    if (!$itemBox) return;
    const itemBox = new ItemBox(require, $itemBox);
    if (!itemBox.isInserted()) {
      itemBox.insert();
    }
  });
});
