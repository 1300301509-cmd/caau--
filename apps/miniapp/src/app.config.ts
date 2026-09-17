export default {
  pages: [
    'pages/home/index',
    'pages/hosting/index',
    'pages/event-info/index',
    'pages/materials/index',
    'pages/progress/index',
    'pages/profile/index',
    'pages/task/index',
    'pages/index/index',
  ],
  window: {
    navigationBarTitleText: 'CAAU 承办工作台',
    navigationBarBackgroundColor: '#fcfcf9',
    navigationBarTextStyle: 'black',
    backgroundColor: '#fcfcf9',
  },
  tabBar: {
    color: '#707970',
    selectedColor: '#23695b',
    backgroundColor: '#fcfcf9',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
};
