import * as React from 'react';
import "./MainViewModal.scss";

export interface MainViewOverlayProps {
    isDisplayed: boolean;
    interactive: boolean;
    contents: string | JSX.Element | null;
    dialogueBoxStyle?: React.CSSProperties;
    overlayStyle?: React.CSSProperties;
    dialogueBoxDisplayedOpacity?: number;
    overlayDisplayedOpacity?: number;
}

export default class MainViewModal extends React.Component<MainViewOverlayProps> {

    render() {
        const p = this.props;
        const dialogueOpacity = p.dialogueBoxDisplayedOpacity || 1;
        const overlayOpacity = p.overlayDisplayedOpacity || 0.4;
        return !p.isDisplayed ? (null) : (
            <div style={{ pointerEvents: p.isDisplayed ? p.interactive ? "all" : "none" : "none" }}>
                <div
                    className={"dialogue-box"}
                    style={{
                        backgroundColor: "gainsboro",
                        borderColor: "black",
                        ...(p.dialogueBoxStyle || {}),
                        opacity: p.isDisplayed ? dialogueOpacity : 0
                    }}
                >{p.contents}</div>
                <div
                    className={"overlay"}
                    style={{
                        backgroundColor: "gainsboro",
                        ...(p.overlayStyle || {}),
                        opacity: p.isDisplayed ? overlayOpacity : 0
                    }}
                />
            </div>
        );
    }


}