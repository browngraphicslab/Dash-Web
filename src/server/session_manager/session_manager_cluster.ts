import { isMaster, fork, on } from "cluster";
import { cpus } from "os";
import { createServer } from "http";

const capacity = cpus().length;

if (isMaster) {
    console.log(capacity);
    for (let i = 0; i < capacity; i++) {
        fork();
    }
    on("exit", (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {
    const port = 1234;
    createServer().listen(port, () => {
        console.log('process id local', process.pid);
        console.log(`http server started at port ${port}`);
    });
}

process.on('uncaughtException', function (err) {
    console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    process.exit(1);
});