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
        const handle = async () => {
            const response = await fetch("/solrHeartbeat");
            if (!(await response.json()).running) {
                !executed && alert("Looks like SOLR is not running on your machine.");
                executed = true;
                clearInterval(solrHandle);
            }
        };
        await handle();
        const solrHandle = setInterval(handle, 1000 * 15);

    }

}