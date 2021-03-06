const test = require('ava');
const cryptoRandomString = require('crypto-random-string');

const awsServices = require('../services');
const {
  createQueue,
  parseSQSMessageBody,
  sqsQueueExists
} = require('../SQS');

const randomString = () => cryptoRandomString({ length: 10 });

test('parseSQSMessageBody parses messages correctly', (t) => {
  const messageBody = { test: 'value' };
  const bodyString = JSON.stringify(messageBody);
  t.deepEqual(parseSQSMessageBody({ Body: bodyString }), messageBody);
  t.deepEqual(parseSQSMessageBody({ body: bodyString }), messageBody);
  t.deepEqual(parseSQSMessageBody({}), {});
});

test('sqsQueueExists detects if the queue does not exist or is not accessible', async (t) => {
  const queueUrl = await createQueue(randomString());
  const queueName = queueUrl.split('/').pop();
  t.true(await sqsQueueExists(queueUrl));
  t.true(await sqsQueueExists(queueName));
  t.false(await sqsQueueExists(randomString()));
  await awsServices.sqs().deleteQueue({ QueueUrl: queueUrl }).promise();
});
