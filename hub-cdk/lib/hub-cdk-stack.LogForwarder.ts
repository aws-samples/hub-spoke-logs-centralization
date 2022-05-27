import { gunzipSync } from 'zlib';
import { CloudWatchLogs } from 'aws-sdk';
import type { CloudWatchLogsEvent, CloudWatchLogsDecodedData } from 'aws-lambda';

const logs = new CloudWatchLogs();

const AGGREGATION_GROUP_NAME: string = process.env.AGGREGATION_GROUP_NAME || '';
if (!AGGREGATION_GROUP_NAME) {
  throw new Error('AGGREGATION_GROUP_NAME must be defined');
}

export async function handler(event: CloudWatchLogsEvent) {
  const payload = Buffer.from(event.awslogs.data, 'base64');
  const decompressed = gunzipSync(payload);
  const parsed: CloudWatchLogsDecodedData = JSON.parse(decompressed.toString('utf8'));

  if (parsed.messageType !== 'DATA_MESSAGE') {
    // Only process DATA_MESSAGE
    console.log(`Received ${parsed.messageType}. Expected DATA_MESSAGE`);
    return;
  }

  console.log(`Received ${parsed.logEvents.length} log events for ${parsed.logStream} in ${parsed.logGroup}`);
  if (parsed.logEvents.length === 0) {
    // If we receive no events, do nothing
    return;
  }

  // Log Stream names are limited to 512 characters
  // Append the source AWS Account ID to prevent cross-account overwrites
  const logStreamName = `${parsed.owner}-${parsed.logStream}`.slice(0, 512);

  // Follows restrictions here: https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
  const MAX_BATCH_SIZE = 1048576;
  const ADDITIONAL_SIZE_PER_MESSAGE = 26;
  const MAX_LOG_EVENTS_PER_PUT = 10000;

  // Total time between events is limited to 24 hours. Set to 23 hours to be safe
  const MAX_TIME_SPAN_IN_MS = 23 * 60 * 60 * 1000;

  const firstEvent = parsed.logEvents[0];
  let firstEventTime = firstEvent.timestamp;
  let currentLogEventsSize = firstEvent.message.length + ADDITIONAL_SIZE_PER_MESSAGE;

  // Start is inclusive. End is exclusive.
  let eventSpanStart = 0;
  let eventSpanEnd = 1;

  let nextSequenceToken: undefined | string = undefined;

  async function writeBatchOfLogs(logEvents: typeof parsed.logEvents) {
    const maxRetries = 5;
    for (let currentAttempt = 0; currentAttempt < maxRetries; currentAttempt++) {
      try {
        const result = await logs
          .putLogEvents({
            logEvents: logEvents.map((e) => ({
              message: e.message,
              timestamp: e.timestamp,
            })),
            logGroupName: AGGREGATION_GROUP_NAME,
            logStreamName,
            sequenceToken: nextSequenceToken,
          })
          .promise();
        nextSequenceToken = result.nextSequenceToken;
        return;
      } catch (e: any) {
        if (e.code === 'InvalidSequenceTokenException') {
          // If we're out of sequence, parse and use the correct sequence token on the next attempt
          const messageExp = /The given sequenceToken is invalid. The next expected sequenceToken is: (.*)/;
          const match = messageExp.exec(e.message);
          if (match) {
            nextSequenceToken = match[1];
            console.log(`Caught and parsed sequence token: ${match[1]}`);
          } else {
            throw new Error(`Could not parse sequence token from error message: ${e.message}`);
          }
        } else if (e.code === 'ResourceNotFoundException') {
          console.log('Creating log stream');

          // If the log stream was never created, create before trying again
          await logs
            .createLogStream({
              logGroupName: AGGREGATION_GROUP_NAME,
              logStreamName,
            })
            .promise();
        } else {
          // Log other unexpected errors
          console.log(e);
        } 

        // If we're on the last attempt, propagate the exception upwards
        if (currentAttempt === maxRetries - 1) {
          throw e;
        }
      }
    }
  }

  for (var i = 0; i < parsed.logEvents.length; i++) {
    if (i === parsed.logEvents.length - 1) {
      // We're processing the last event. Write out what we've collected so far
      const finalEvents = parsed.logEvents.slice(eventSpanStart);
      console.log(`Writing final count of ${finalEvents.length} size of ${currentLogEventsSize}`);
      await writeBatchOfLogs(finalEvents);
      return;
    }

    const nextEvent = parsed.logEvents[i + 1];
    const eventCount = eventSpanEnd - eventSpanStart;
    const nextLogSize = nextEvent.message.length + ADDITIONAL_SIZE_PER_MESSAGE;

    const nextTotalLogSize = currentLogEventsSize + nextLogSize;
    const nextSpanSize = eventCount + 1;

    const nextTimeSpan = nextEvent.timestamp - firstEventTime;

    // If including the next event would keep us under the limits, process the next event
    // The conditions are:
    //   Next Total Size < Max Batch Size
    //   Next Event Count < Max Event Count
    //   Next Time Span < Max Time Span
    if (
      nextTotalLogSize < MAX_BATCH_SIZE &&
      nextSpanSize <= MAX_LOG_EVENTS_PER_PUT &&
      nextTimeSpan < MAX_TIME_SPAN_IN_MS
    ) {
      // Add the next event to the current batch
      currentLogEventsSize = nextTotalLogSize;
      eventSpanEnd++;
      continue;
    }

    // Write out the events so far
    const eventsToSend = parsed.logEvents.slice(eventSpanStart, eventSpanStart + eventCount);
    console.log(`Writing count of ${eventsToSend.length} size of ${currentLogEventsSize}`);
    await writeBatchOfLogs(eventsToSend);

    // Reset the events collected to contain only the next event
    eventSpanStart = i + 1;
    eventSpanEnd = i + 2;
    currentLogEventsSize = nextLogSize;
    firstEventTime = nextEvent.timestamp;
  }
}
