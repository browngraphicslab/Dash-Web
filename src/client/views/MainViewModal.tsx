import * as React from 'react';
import "./MainViewModal.scss";
import { observable, action, computed } from 'mobx';
import { observer } from 'mobx-react';

export interface MainViewOverlayProps {
    isDisplayed: boolean;
    interactive: boolean;
    contents: string | JSX.Element;
    dialogueBoxStyle?: React.CSSProperties;
    overlayStyle?: React.CSSProperties;
    dialogueBoxDisplayedOpacity?: number;
    overlayDisplayedOpacity?: number;
}

@observer
export default class MainViewModal extends React.Component<MainViewOverlayProps> {
    @computed
    private get _p() {
        return this.props;
    }

    render() {
        let dialogueOpacity = this._p.dialogueBoxDisplayedOpacity || 1;
        let overlayOpacity = this._p.overlayDisplayedOpacity || 0.4;
        return (
            <div style={{ pointerEvents: this._p.isDisplayed ? this._p.interactive ? "all" : "none" : "none" }}>
                <div
                    className={"dialogue-box"}
                    style={{
                        backgroundColor: "gainsboro",
                        borderColor: "black",
                        ...(this._p.dialogueBoxStyle || {}),
                        opacity: this._p.isDisplayed ? dialogueOpacity : 0
                    }}
                >{this._p.isDisplayed ? this._p.contents : (null)}</div>
                <div
                    className={"overlay"}
                    style={{
                        backgroundColor: "gainsboro",
                        ...(this._p.overlayStyle || {}),
                        opacity: this._p.isDisplayed ? overlayOpacity : 0
                    }}
                />
            </div>
        );
    }


}