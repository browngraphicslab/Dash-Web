import { observable, runInAction } from "mobx";
import { MainView } from "../views/MainView";

export namespace ClientDiagnostics {

    export function start() {

        let serverPolls = 0;
        const serverHandle = setInterval(async () => {
            if (++serverPolls === 20) {
                alert("Your connection to the server has been terminated.");
                clearInterval(serverHandle);
            }
            await fetch("/serverHeartbeat");
            serverPolls--;
        }, 100);


        const solrHandle = setInterval(async () => {
            const response = await fetch("/solrHeartbeat");
            if (!response) {
                alert("Looks like SOLR is not running on your machine.");
                clearInterval(solrHandle);
            }
        }, 100);

    }

}