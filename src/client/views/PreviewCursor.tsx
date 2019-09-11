import { action, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import "./PreviewCursor.scss";
import { Docs } from '../documents/Documents';
// import { Transform } from 'prosemirror-transform';
import { Doc } from '../../new_fields/Doc';
import { Transform } from "../util/Transform";

@observer
export class PreviewCursor extends React.Component<{}> {
    private _prompt = React.createRef<HTMLDivElement>();
    static _onKeyPress?: (e: KeyboardEvent) => void;
    static _getTransform: () => Transform;
    static _addLiveTextDoc: (doc: Doc) => void;
    static _addDocument: (doc: Doc, allowDuplicates: false) => boolean;
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
        if (PreviewCursor.Visible) {
            if (e.clipboardData) {
                let newPoint = PreviewCursor._getTransform().transformPoint(PreviewCursor._clickPoint[0], PreviewCursor._clickPoint[1]);
                runInAction(() => { PreviewCursor.Visible = false; });


                if (e.clipboardData.getData("text/plain") !== "") {

                    // tests for youtube and makes video document
                    if (e.clipboardData.getData("text/plain").indexOf("www.youtube.com/watch") !== -1) {
                        const url = e.clipboardData.getData("text/plain").replace("youtube.com/watch?v=", "youtube.com/embed/");
                        PreviewCursor._addDocument(Docs.Create.VideoDocument(url, {
                            title: url, width: 400, height: 315,
                            nativeWidth: 600, nativeHeight: 472.5,
                            x: newPoint[0], y: newPoint[1]
                        }), false);
                        return;
                    }

                    // tests for URL and makes web document
                    let re: any = /^https?:\/\//g;
                    if (re.test(e.clipboardData.getData("text/plain"))) {
                        const url = e.clipboardData.getData("text/plain");
                        PreviewCursor._addDocument(Docs.Create.WebDocument(url, {
                            title: url, width: 300, height: 300,
                            // nativeWidth: 300, nativeHeight: 472.5,
                            x: newPoint[0], y: newPoint[1]
                        }), false);
                        return;
                    }

                    // creates text document
                    let newBox = Docs.Create.TextDocument({
                        width: 200, height: 100,
                        x: newPoint[0],
                        y: newPoint[1],
                        title: "-pasted text-"
                    });

                    newBox.proto!.autoHeight = true;
                    PreviewCursor._addLiveTextDoc(newBox);
                    return;
                }
                //pasting in images
                if (e.clipboardData.getData("text/html") !== "" && e.clipboardData.getData("text/html").includes("<img src=")) {
                    let re: any = /<img src="(.*?)"/g;
                    let arr: any[] = re.exec(e.clipboardData.getData("text/html"));

                    let img: Doc = Docs.Create.ImageDocument(
                        arr[1], {
                            width: 300, title: arr[1],
                            x: newPoint[0],
                            y: newPoint[1],
                        });
                    PreviewCursor._addDocument(img, false);
                    return;
                }

            }
        }
    }

    @action
    onKeyPress = (e: KeyboardEvent) => {
        // Mixing events between React and Native is finicky. 
        //if not these keys, make a textbox if preview cursor is active!
        if (e.key !== "Escape" && e.key !== "Backspace" && e.key !== "Delete" && e.key !== "CapsLock" &&
            e.key !== "Alt" && e.key !== "Shift" && e.key !== "Meta" && e.key !== "Control" &&
            e.key !== "Insert" && e.key !== "Home" && e.key !== "End" && e.key !== "PageUp" && e.key !== "PageDown" &&
            e.key !== "NumLock" &&
            (e.keyCode < 112 || e.keyCode > 123) && // F1 thru F12 keys
            !e.key.startsWith("Arrow") &&
            !e.defaultPrevented) {
            if ((!e.ctrlKey || (e.keyCode >= 48 && e.keyCode <= 57)) && !e.metaKey) {//  /^[a-zA-Z0-9$*^%#@+-=_|}{[]"':;?/><.,}]$/.test(e.key)) {
                PreviewCursor.Visible && PreviewCursor._onKeyPress && PreviewCursor._onKeyPress(e);
                PreviewCursor.Visible = false;
            }
        }
    }
    @action
    public static Show(x: number, y: number,
        onKeyPress: (e: KeyboardEvent) => void,
        addLiveText: (doc: Doc) => void,
        getTransform: () => Transform,
        addDocument: (doc: Doc, allowDuplicates: false) => boolean) {
        this._clickPoint = [x, y];
        this._onKeyPress = onKeyPress;
        this._addLiveTextDoc = addLiveText;
        this._getTransform = getTransform;
        this._addDocument = addDocument;
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