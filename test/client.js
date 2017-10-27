const faktory = require('../');

faktory.connect().then((client) => {
  for (;;) {
    client.push({
      jobtype: 'MyDoWorkJob',
      queue: 'default',
      args: [1, 'big']
    })
  }
}).catch(console.error.bind(console))
