import * as React from 'react';
import "./MainViewModal.scss";
import { observer } from 'mobx-react';

export interface MainViewOverlayProps {
    isDisplayed: boolean;
    interactive: boolean;
    contents: string | JSX.Element | null;
    dialogueBoxStyle?: React.CSSProperties;
    overlayStyle?: React.CSSProperties;
    dialogueBoxDisplayedOpacity?: number;
    overlayDisplayedOpacity?: number;
    closeOnExternalClick?: () => void; // the close method of a MainViewModal, triggered if there is a click on the overlay (closing the modal)
}

@observer
export class MainViewModal extends React.Component<MainViewOverlayProps> {

    render() {
        const p = this.props;
        const dialogueOpacity = p.dialogueBoxDisplayedOpacity || 1;
        const overlayOpacity = p.overlayDisplayedOpacity || 0.4;
        return !p.isDisplayed ? (null) : (
            <div className="mainViewModal-cont" style={{
                pointerEvents: p.isDisplayed && p.interactive ? "all" : "none"
            }}>
                <div className="dialogue-box" style={{
                    borderColor: "black",
                    ...(p.dialogueBoxStyle || {}),
                    opacity: p.isDisplayed ? dialogueOpacity : 0
                }} >
                    {p.contents}
                </div>
                <div className="overlay"
                    onClick={this.props?.closeOnExternalClick}
                    style={{
                        backgroundColor: "black",
                        ...(p.overlayStyle || {}),
                        opacity: p.isDisplayed ? overlayOpacity : 0
                    }}
                />
            </div>
        );
    }
}