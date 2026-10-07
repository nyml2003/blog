declare const __BLOG_WEAPP_API_ORIGIN__: string;

App({
  globalData: { apiOrigin: __BLOG_WEAPP_API_ORIGIN__ },
  onLaunch() {
    wx.setStorageSync("blog.weapp.ready", true);
  },
});
