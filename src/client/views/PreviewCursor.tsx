import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import "./PreviewCursor.scss";
import { Docs } from '../documents/Documents';
import { Transform } from 'prosemirror-transform';
import { Doc } from '../../new_fields/Doc';

@observer
export class PreviewCursor extends React.Component<{}> {
    private _prompt = React.createRef<HTMLDivElement>();
    static _onKeyPress?: (e: KeyboardEvent) => void;
    static _addLiveTextDoc: (doc: Doc) => void;
    @observable static _clickPoint = [0, 0];
    @observable public static Visible = false;
    //when focus is lost, this will remove the preview cursor
    @action onBlur = (): void => {
        PreviewCursor.Visible = false;
    }

    constructor(props: any) {
        super(props);
        document.addEventListener("keydown", this.onKeyPress);
        document.addEventListener("paste", this.paste);
    }

    paste = (e: ClipboardEvent) => {
        console.log(e.clipboardData);
        if (e.clipboardData) {
            //what needs to be done with this?
            console.log(e.clipboardData.getData("text/html"));
            // console.log(e.clipboardData.getData("text/csv"));
            console.log(e.clipboardData.getData("text/plain"));
            console.log(e.clipboardData.getData("image/png"));
            console.log(e.clipboardData.getData("image/jpg"));
            console.log(e.clipboardData.getData("image/jpeg"));

            if (e.clipboardData.getData("text/plain") !== "") {
                let text = e.clipboardData.getData("text/plain");
                let newBox = Docs.Create.TextDocument({ width: 200, height: 100, x: PreviewCursor._clickPoint[0], y: PreviewCursor._clickPoint[1], title: "-typed text-" });
                newBox.proto!.autoHeight = true;
                PreviewCursor._addLiveTextDoc(newBox);
            }
        }

        // let newBox = Docs.Create.TextDocument({ width: 200, height: 100, x: x, y: y, title: "-typed text-" });
        //     newBox.proto!.autoHeight = true;
        //     this.props.addLiveTextDocument(newBox);
    }

    @action
    onKeyPress = (e: KeyboardEvent) => {
        // Mixing events between React and Native is finicky.  In FormattedTextBox, we set the
        // DASHFormattedTextBoxHandled flag when a text box consumes a key press so that we can ignore
        // the keyPress here. 112-
        //if not these keys, make a textbox if preview cursor is active!
        if (e.key !== "Escape" && e.key !== "Backspace" && e.key !== "Delete" && e.key !== "CapsLock" &&
            e.key !== "Alt" && e.key !== "Shift" && e.key !== "Meta" && e.key !== "Control" &&
            e.key !== "Insert" && e.key !== "Home" && e.key !== "End" && e.key !== "PageUp" && e.key !== "PageDown" &&
            e.key !== "NumLock" &&
            (e.keyCode < 112 || e.keyCode > 123) && // F1 thru F12 keys
            !e.key.startsWith("Arrow") &&
            !e.defaultPrevented && !(e as any).DASHFormattedTextBoxHandled) {
            if (!e.ctrlKey && !e.metaKey) {//  /^[a-zA-Z0-9$*^%#@+-=_|}{[]"':;?/><.,}]$/.test(e.key)) {
                PreviewCursor.Visible && PreviewCursor._onKeyPress && PreviewCursor._onKeyPress(e);
                PreviewCursor.Visible = false;
            }
        }
    }
    @action
    public static Show(x: number, y: number, onKeyPress: (e: KeyboardEvent) => void, addLiveText: (doc: Doc) => void) {
        console.log("clickpoint setting")
        this._clickPoint = [x, y];
        this._onKeyPress = onKeyPress;
        this._addLiveTextDoc = addLiveText;
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