'use strict';

/**
 * Node Modules
 */
const http = require('http');
const pizzaGuy = require('pizza-guy');
const fs = require('fs');
const html2text = require('html-to-text');

/**
 * Module Globals
 */
const API_KEY = 'pXcUXQdlBndW7znq4C4vodeQg0OxCXOlXv2RamTphjNFj0MuzI';
const imagesToDownload = [];
let postsToLoad;
let postsOffset = 0;
let tumblrBlogUrl = '';
let includeNotes = false;
let downloadedPosts = 0;
let customPathToSave = '';
let onStartCallback = () => {};
let onFetchCallback = () => {};
let onSuccessCallback = () => {};
let onErrorCallback = () => {};

/**
 * Parse data in order to set valid global data
 * @param {Object} params object with keys
 * @returns {void}
 */
const setGlobalParams = (params) => {
  tumblrBlogUrl = params.url;
  postsToLoad = typeof params.postsToLoad !== 'undefined'
    ? Number(params.postsToLoad)
    : postsToLoad;
  postsOffset = typeof params.postsOffset !== 'undefined'
      ? Number(params.postsOffset)
      : postsOffset;
  customPathToSave = params.path
    ? params.path[0] === '/'
      ? `${params.path}`
      : `${process.cwd()}/${params.path}`
    : process.cwd();
  includeNotes = typeof params.includeNotes !== 'undefined' && params.includeNotes === true
    ? true
    : includeNotes;
  onStartCallback = typeof params.onStart === 'function' ? params.onStart : onStartCallback;
  onFetchCallback = typeof params.onFetch === 'function' ? params.onFetch : onFetchCallback;
  onSuccessCallback = typeof params.onSuccess === 'function' ? params.onSuccess : onSuccessCallback;
  onErrorCallback = typeof params.onError === 'function' ? params.onError : onErrorCallback;
};

/**
 * Starts download process
 * @return {void}
 */
const downloadImages = () => {
  pizzaGuy
    .deliver(imagesToDownload)
    .onAddress(customPathToSave)
    .onSuccess(onSuccessCallback)
    .onError(onErrorCallback)
    .start();
};

/**
 * Make sure the filenames are safe by stripping out problematic characters
 * @param {String} filename a potential filename
 * @returns {String} filename with characters stripped out
 */
const cleanFileName = function (filename) {
  // https://en.wikipedia.org/wiki/Filename#Reserved_characters_and_words
  // https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247.aspx#file_and_directory_names
  return filename.replace(/[<>:"/\\|?*\x00-\x1F\r\n\t]/g, '');
};

/**
 * Gets liked posts from the server
 * @param  {String} timestamp used as an offset for the request
 * @return {void}
 */
const getLikedPosts = (timestamp) => {

  const beforeParam = timestamp ? `&before=${timestamp}` : '';
  if (timestamp) {
    postsOffset = 0;
  }
  const offsetParam = postsOffset > 0 ? `&offset=${postsOffset}` : '';
  http.get(
    {
      host: 'api.tumblr.com',
      port: 80,
      path: `/v2/blog/${tumblrBlogUrl}/likes?api_key=${API_KEY}${beforeParam}${offsetParam}`
    },
    (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        const _data = JSON.parse(data).response;
        let likedPosts = _data.liked_posts;
        if (likedPosts) {
          const likedCount = _data.liked_count;
          const pushToArray = (filebase, photo, i) => {
            const filename = `${filebase}_${i}.${photo.original_size.url.split('.').pop()}`;
            imagesToDownload.push(
              { url: photo.original_size.url, name: filename }
            );
          };
          const saveNote = (filebase, notetext) => {
            if (notetext !== '') {
              const plaintext = html2text.fromString(notetext);
              fs.writeFile(`${customPathToSave}/${filebase}.txt`, plaintext);
            }
          };
          let lastPostTimestamp = null;

          if (postsToLoad < likedPosts.length) {
            likedPosts = likedPosts.slice(0, postsToLoad);
          }

          // This will happen just once
          if (!timestamp) {
            postsToLoad = postsToLoad
              ? postsToLoad > likedCount
                ? likedCount
                : postsToLoad
              : likedCount;
            onStartCallback({
              postsToLoad
            });
          }

          for (let i = 0; i < likedPosts.length; i++) {
            const currentPost = likedPosts[i];
            if (Array.isArray(currentPost.photos)) {
              const filebase = cleanFileName(`${currentPost.blog_name}_${currentPost.timestamp}`);
              currentPost.photos.forEach(pushToArray.bind(null, filebase));
              if (includeNotes === true && currentPost.hasOwnProperty('caption')) {
                saveNote(filebase, currentPost.caption);
              }
            }
            downloadedPosts++;
            lastPostTimestamp = likedPosts[i].timestamp;
            if (downloadedPosts === postsToLoad) {
              break;
            }
          }

          onFetchCallback({
            postsToLoad,
            downloadedPosts,
            imagesToDownload: imagesToDownload.length
          });

          if (postsToLoad === downloadedPosts) {
            downloadImages();
          } else {
            getLikedPosts(lastPostTimestamp);
          }
        } else {
          onStartCallback({
            postsToLoad
          });
        }
      });
    }
  )
  .on('error', (err) => {
    if (err) {
      throw err;
    }
  });

};

module.exports = {
  setGlobalParams,
  getLikedPosts
};
