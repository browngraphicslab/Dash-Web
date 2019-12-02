export namespace ClientDiagnostics {

    export async function start() {

        let serverPolls = 0;
        const serverHandle = setInterval(async () => {
            if (++serverPolls === 20) {
                alert("Your connection to the server has been terminated.");
                clearInterval(serverHandle);
            }
            await fetch("/serverHeartbeat");
            serverPolls--;
        }, 1000 * 15);

        let executed = false;
        let solrHandle: NodeJS.Timeout | undefined;
        const handler = async () => {
            const response = await fetch("/solrHeartbeat");
            if (!(await response.json()).running) {
                if (!executed) {
                    alert("Looks like SOLR is not running on your machine.");
                    executed = true;
                    solrHandle && clearInterval(solrHandle);
                }
            }
        };
        await handler();
        if (!executed) {
            solrHandle = setInterval(handler, 1000 * 15);
        }

    }

}