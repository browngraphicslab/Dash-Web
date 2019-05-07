import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import "./PreviewCursor.scss";

@observer
export class PreviewCursor extends React.Component<{}> {
    private _prompt = React.createRef<HTMLDivElement>();
    static _onKeyPress?: (e: KeyboardEvent) => void;
    @observable static _clickPoint = [0, 0];
    @observable public static Visible = false;
    //when focus is lost, this will remove the preview cursor
    @action onBlur = (): void => {
        PreviewCursor.Visible = false;
    }

    constructor(props: any) {
        super(props);
        document.addEventListener("keydown", this.onKeyPress)
    }

    @action
    onKeyPress = (e: KeyboardEvent) => {
        // Mixing events between React and Native is finicky.  In FormattedTextBox, we set the
        // DASHFormattedTextBoxHandled flag when a text box consumes a key press so that we can ignore
        // the keyPress here.
        //if not these keys, make a textbox if preview cursor is active!
        if (e.key.startsWith("F") && !e.key.endsWith("F")) {
        } else if (e.key != "Escape" && e.key != "Alt" && e.key != "Shift" && e.key != "Meta" && e.key != "Control" && !e.defaultPrevented && !(e as any).DASHFormattedTextBoxHandled) {
            if ((!e.ctrlKey && !e.metaKey) || e.key === "v" || e.key === "q") {
                PreviewCursor.Visible && PreviewCursor._onKeyPress && PreviewCursor._onKeyPress(e);
                PreviewCursor.Visible = false;
            }
        }
    }
    @action
    public static Show(x: number, y: number, onKeyPress: (e: KeyboardEvent) => void) {
        this._clickPoint = [x, y];
        this._onKeyPress = onKeyPress;
        setTimeout(action(() => this.Visible = true), (1));
    }
    render() {
        if (!PreviewCursor._clickPoint) {
            return (null);
        }
        if (PreviewCursor.Visible && this._prompt.current) {
            this._prompt.current.focus();
        }
        return <div className="previewCursor" id="previewCursor" onBlur={this.onBlur} tabIndex={0} ref={this._prompt}
            style={{ transform: `translate(${PreviewCursor._clickPoint[0]}px, ${PreviewCursor._clickPoint[1]}px)`, opacity: PreviewCursor.Visible ? 1 : 0 }}>
            I
        </div >;
    }
}