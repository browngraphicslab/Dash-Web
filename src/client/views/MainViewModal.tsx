import * as React from 'react';
import "./MainViewModal.scss";
import { Opt } from '../../fields/Doc';
import { Lambda, reaction } from 'mobx';
import { observer } from 'mobx-react';

export interface MainViewOverlayProps {
    isDisplayed: boolean;
    interactive: boolean;
    contents: string | JSX.Element | null;
    dialogueBoxStyle?: React.CSSProperties;
    overlayStyle?: React.CSSProperties;
    dialogueBoxDisplayedOpacity?: number;
    overlayDisplayedOpacity?: number;
    closeOnExternalClick?: () => void;
}

@observer
export default class MainViewModal extends React.Component<MainViewOverlayProps> {

    private ref: React.RefObject<HTMLDivElement> = React.createRef();
    private displayedListenerDisposer: Opt<Lambda>;

    componentDidMount() {

        document.removeEventListener("pointerdown", this.close);

        this.displayedListenerDisposer = reaction(() => this.props.isDisplayed, (isDisplayed) => {
            if (isDisplayed) document.addEventListener("pointerdown", this.close);
            else document.removeEventListener("pointerdown", this.close);
        });
    }

    componentWillUnmount() {
        this.displayedListenerDisposer?.();
        document.removeEventListener("pointerdown", this.close);
    }

    close = (e: PointerEvent) => {

        const { left, right, top, bottom } = this.ref.current!.getBoundingClientRect();

        if (e.clientX === 0 && e.clientY === 0) return; // why does this happen?
        if (e.clientX < left || e.clientX > right || e.clientY > bottom || e.clientY < top) {
            this.props.closeOnExternalClick?.();
        }

    }

    render() {
        const p = this.props;
        const dialogueOpacity = p.dialogueBoxDisplayedOpacity || 1;
        const overlayOpacity = p.overlayDisplayedOpacity || 0.4;
        return !p.isDisplayed ? (null) : (
            <div style={{ pointerEvents: p.isDisplayed ? p.interactive ? "all" : "none" : "none" }}>
                <div
                    className={"dialogue-box"}
                    style={{
                        borderColor: "black",
                        ...(p.dialogueBoxStyle || {}),
                        opacity: p.isDisplayed ? dialogueOpacity : 0
                    }}
                    ref={this.ref}
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