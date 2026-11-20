// Prints the arguments it was started with, as JSON: the argument round trip in
// test/agent/node.test.ts, through the same wrapper the fake `claude` gets.
process.stdout.write(JSON.stringify(process.argv.slice(2)));
