const SomeService = {
  name: 'SomeService',
  test: async x => {
    console.log('test->',x);
    return {y:5,test:x};
  },

  init: async(server)=>{
    console.log('init some service');
    server.io.on('connect', socket=>{
      socket
        .on('test', SomeService.test)
      ;
    });
  },
};

export default SomeService;
