import { isMaster, fork, on } from "cluster";
import { cpus } from "os";
import { createServer } from "http";

const capacity = cpus().length;

let thrown = false;

if (isMaster) {
    console.log(capacity);
    for (let i = 0; i < capacity; i++) {
        fork();
    }
    on("exit", (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
        fork();
    });
} else {
    const port = 1234;
    createServer().listen(port, () => {
        console.log('process id local', process.pid);
        console.log(`http server started at port ${port}`);
        if (!thrown) {
            thrown = true;
            setTimeout(() => {
                throw new Error("Hey I'm a fake error!");
            }, 1000);
        }
    });
}

process.on('uncaughtException', function (err) {
    console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    process.exit(1);
});