import { computed, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { DictationManager } from '../util/DictationManager';
import "./Main.scss";
import MainViewModal from './MainViewModal';

@observer
export class DictationOverlay extends React.Component {
    public static Instance: DictationOverlay;
    @observable private _dictationState = DictationManager.placeholder;
    @observable private _dictationSuccessState: boolean | undefined = undefined;
    @observable private _dictationDisplayState = false;
    @observable private _dictationListeningState: DictationManager.Controls.ListeningUIStatus = false;

    public isPointerDown = false;
    public overlayTimeout: NodeJS.Timeout | undefined;
    public hasActiveModal = false;

    constructor(props: any) {
        super(props);
        DictationOverlay.Instance = this;
    }

    public initiateDictationFade = () => {
        const duration = DictationManager.Commands.dictationFadeDuration;
        this.overlayTimeout = setTimeout(() => {
            this.dictationOverlayVisible = false;
            this.dictationSuccess = undefined;
            DictationOverlay.Instance.hasActiveModal = false;
            setTimeout(() => this.dictatedPhrase = DictationManager.placeholder, 500);
        }, duration);
    }
    public cancelDictationFade = () => {
        if (this.overlayTimeout) {
            clearTimeout(this.overlayTimeout);
            this.overlayTimeout = undefined;
        }
    }

    @computed public get dictatedPhrase() { return this._dictationState; }
    @computed public get dictationSuccess() { return this._dictationSuccessState; }
    @computed public get dictationOverlayVisible() { return this._dictationDisplayState; }
    @computed public get isListening() { return this._dictationListeningState; }

    public set dictatedPhrase(value: string) { runInAction(() => this._dictationState = value); }
    public set dictationSuccess(value: boolean | undefined) { runInAction(() => this._dictationSuccessState = value); }
    public set dictationOverlayVisible(value: boolean) { runInAction(() => this._dictationDisplayState = value); }
    public set isListening(value: DictationManager.Controls.ListeningUIStatus) { runInAction(() => this._dictationListeningState = value); }

    render() {
        const success = this.dictationSuccess;
        const result = this.isListening && !this.isListening.interim ? DictationManager.placeholder : `"${this.dictatedPhrase}"`;
        const dialogueBoxStyle = {
            background: success === undefined ? "gainsboro" : success ? "lawngreen" : "red",
            borderColor: this.isListening ? "red" : "black",
            fontStyle: "italic"
        };
        const overlayStyle = {
            backgroundColor: this.isListening ? "red" : "darkslategrey"
        };
        return (<MainViewModal
            contents={result}
            isDisplayed={this.dictationOverlayVisible}
            interactive={false}
            dialogueBoxStyle={dialogueBoxStyle}
            overlayStyle={overlayStyle}
            closeOnExternalClick={this.initiateDictationFade}
        />);
    }
}