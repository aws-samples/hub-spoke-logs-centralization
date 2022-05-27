const AWS = require('aws-sdk');

const logs = new AWS.CloudWatchLogs();

async function main() {
  const batchSize = 1000;
  const maxEvents = 100000;

  const id = Math.random().toString(16).slice(2);
  const streamName = `testing-${id}`;

  console.log(`Sending ${maxEvents} events with a batch size of ${batchSize} to ${streamName}`);

  try {
    await logs
      .createLogStream({
        logGroupName: '/apg/spoke-group',
        logStreamName: streamName,
      })
      .promise();
  } catch (e) {
    if (e.code !== 'ResourceAlreadyExistsException') throw e;
  }

  let nextSequenceToken = undefined;
  for (let i = 0; i * batchSize < maxEvents; i++) {
    console.log(`Sending ${batchSize} events`);

    try {
      const result = await logs
        .putLogEvents({
          logGroupName: '/apg/spoke-group',
          logStreamName: streamName,
          sequenceToken: nextSequenceToken,
          logEvents: Array.from({ length: batchSize }, (v, batchItem) => ({
            timestamp: Date.now(),
            message: JSON.stringify({ testing: 'message', batch: i, batchItem, x: 'x'.repeat(100) }),
          })),
        })
        .promise();
      nextSequenceToken = result.nextSequenceToken;
    } catch (e) {
      console.log(e);
    }
  }
}

main().catch((e) => console.log(e));
