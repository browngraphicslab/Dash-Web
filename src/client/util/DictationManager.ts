namespace CORE {
    export interface IWindow extends Window {
        webkitSpeechRecognition: any;
    }
}

const { webkitSpeechRecognition }: CORE.IWindow = window as CORE.IWindow;

export default class DictationManager {
    public static Instance = new DictationManager();
    private isListening = false;
    private recognizer: any;

    constructor() {
        this.recognizer = new webkitSpeechRecognition();
        this.recognizer.interimResults = false;
        this.recognizer.continuous = true;
    }

    finish = (handler: any, data: any) => {
        handler(data);
        this.isListening = false;
        this.recognizer.stop();
    }

    listen = () => {
        if (this.isListening) {
            return undefined;
        }
        this.isListening = true;
        this.recognizer.start();
        return new Promise<string>((resolve, reject) => {
            this.recognizer.onresult = (e: any) => this.finish(resolve, e.results[0][0].transcript);
            this.recognizer.onerror = (e: any) => this.finish(reject, e);
        });

    }

}