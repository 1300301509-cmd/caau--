export default {
  pages: [
    'pages/todo/index',
    'pages/events/index',
    'pages/profile/index',
    'pages/task/index',
    'pages/index/index',
  ],
  tabBar: {
    color: '#475569',
    selectedColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    list: [
      { pagePath: 'pages/todo/index', text: '待办' },
      { pagePath: 'pages/events/index', text: '赛事' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
  window: {
    navigationBarTitleText: 'CAAU 材料工作空间',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f5f7fa',
  },
};
