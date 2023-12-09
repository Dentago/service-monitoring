/**
 * Basic ping/echo monitor for the dentago system.
 * The app publishes messages with the topic dentago/monitor/+service/ping
 * and receives messages with the topic dentago/monitor/+service/echo
 * 
 * It also listens to all the services (dentago/#) to calculate their current load
 */

// TODO: Maybe make a simple graphic interface, just boxes and text
const mqtt = require('mqtt');

// MQTT Components
const SERVICES = [
    'booking',
    'dentago', // TODO: Maybe the dentago-api needs a different name
    'dentist',
    'availability'
];

const SUB_MQTT_TOPIC = 'dentago/#';

const formatPubTopic = (service) => `dentago/monitor/${service}/ping`;

// Regex for matching dentago/monitor/+service/echo
// ([^/]+) denotes a capturing group that matches any character but '/'
const subEchoRegex = /^dentago\/monitor\/([^/]+)\/echo$/;

const MQTT_OPTIONS = {
    // Placeholder to add options in the future
    keepalive: 0
}

const HEARTBEAT_INTERVAL = 1000; // 1 second
const LOAD_CHECK_MINUTE = 10000; // 60 seconds
const LOAD_CHECK_SECOND = 1000; // 1 seconds
const QUEUE_MAX_LENGTH = Math.round(LOAD_CHECK_MINUTE / 1000);
const DISPLAY_EVERY_SEC = 5000;

// Services' Data
let isServiceOnline = {};
let requestsPerSecond = {};
let requestsPerMinute = {};

// Ping to each service
function sendHeartbeat() {
    SERVICES.forEach(service => {
        client.publish(formatPubTopic(service), `pinging ${service} :)`);
    });
    // console.log('\n');
}

function updateQueue(queue) {
    const spliceSize = Math.max(queue.length - QUEUE_MAX_LENGTH, 0);
    queue.splice(0, spliceSize);
}

// Repeat every HEARTBEAT_INTERVAL
function checkServiceStatus() {
    setTimeout(() => {
        SERVICES.forEach(service => {
            // if (!isServiceOnline[service]) {
            //     console.log(`Service for ${service} is offline 🤡`);
            // }
            // else {
            //     console.log(`Service for ${service} is online 😎`);
            // }

            // Reset status
            isServiceOnline[service] = false;
        });

        sendHeartbeat();
        checkServiceStatus();
    }, HEARTBEAT_INTERVAL);
}

// Repeat every LOAD_CHECK_SECOND
function checkLoadPerSecond() {
    setTimeout(() => {

        // Listen to all the requests for all the services in 1 second
        SERVICES.forEach(service => {
            // console.log(`Load in ${service} service: ${requestsPerSecond[service]} requests per second`);
            requestsPerMinute[service].push(requestsPerSecond[service]);
            // Reset counter
            requestsPerSecond[service] = 0;
        });

        checkLoadPerSecond();
    }, LOAD_CHECK_SECOND);
}

function checkLoadPerMinute() {
    setTimeout(() => {
        SERVICES.forEach(service => {
            // Update the queue size so it only stores the data from the past 60 seconds
            updateQueue(requestsPerMinute[service]);
            let sum = requestsPerMinute[service].reduce((accumulator, currentValue) => accumulator + currentValue, 0);
            // console.log(`Load in the ${service} service during the last minute: ${sum} requests per minute`);

        });
        checkLoadPerMinute();
    }, LOAD_CHECK_MINUTE);
}

function displayInfo() {
    setTimeout(() => {
        console.log('--------------------------------------');
        SERVICES.forEach(service => {
            const status = isServiceOnline[service] ? 'online 😎' : 'offline 🤡';

            console.log(`Service ${service} status:`);
            console.log(`\t${status}`);

            let totalReqPerMin = requestsPerMinute[service].reduce((accumulator, currentValue) => accumulator + currentValue, 0);
            let averageReqPerSec = totalReqPerMin/QUEUE_MAX_LENGTH;
            
            console.log(`\t${averageReqPerSec} average requests per second`);
            
            console.log(`\t${totalReqPerMin} total requests per minute`);

        });
        console.log('');

        displayInfo();
    }, DISPLAY_EVERY_SEC);
}

const client = mqtt.connect('mqtt://test.mosquitto.org', MQTT_OPTIONS);

client.on('connect', () => {
    console.log('MQTT successfully connected!');

    // Subscribe to topic 'dentago/#'
    client.subscribe(SUB_MQTT_TOPIC, (err) => {
        if (err) console.log('MQTT connection error: ' + err);
    });

    // Initialize isServiceOnline object
    SERVICES.forEach(service => {
        isServiceOnline[service] = false;
        requestsPerSecond[service] = 0;
        requestsPerMinute[service] = []; // Initialize queues
    });

    sendHeartbeat();
    checkServiceStatus();
    checkLoadPerSecond();
    checkLoadPerMinute();
    displayInfo();
});

client.on('message', (topic, _) => {

    const match = topic.match(subEchoRegex);

    // If topic matches dentago/monitoring/+service/echo or dentago/service, extract the service
    const service = match ? match[1] : topic.split('/')[1];

    if (match) {
        isServiceOnline[service] = true;
    }
    else if (SERVICES.includes(service)) {
        requestsPerSecond[service] += 1;
    }
});

client.on('error', (err) => {
    console.error(err);
    process.exit(1);
});
