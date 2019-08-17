import * as React from 'react';
import "./MainViewModal.scss";

export interface MainViewOverlayProps {
    isDisplayed: boolean;
    interactive: boolean;
    contents: string | JSX.Element;
    dialogueBoxStyle: React.CSSProperties;
    overlayStyle: React.CSSProperties;
    dialogueBoxDisplayedOpacity: number;
    overlayDisplayedOpacity: number;
}

export default class MainViewModal extends React.Component<MainViewOverlayProps> {

    render() {
        return (
            <div style={{ pointerEvents: this.props.interactive ? "all" : "none" }}>
                <div
                    className={"dialogue-box"}
                    style={this.props.dialogueBoxStyle}
                >{this.props.contents}</div>
                <div
                    className={"overlay"}
                    style={this.props.overlayStyle}
                />
            </div>
        );
    }


}