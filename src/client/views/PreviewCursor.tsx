import { action, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import "./PreviewCursor.scss";
import { Docs, DocUtils } from '../documents/Documents';
import { Doc } from '../../fields/Doc';
import { Transform } from "../util/Transform";
import { DocServer } from '../DocServer';
import { undoBatch, UndoManager } from '../util/UndoManager';
import { NumCast, Cast } from '../../fields/Types';
import { FormattedTextBox } from './nodes/formattedText/FormattedTextBox';
import * as rp from 'request-promise';
import { Utils } from '../../Utils';
import { Networking } from '../Network';
import { Upload } from '../../server/SharedMediaTypes';
import { basename } from 'path';

@observer
export class PreviewCursor extends React.Component<{}> {
    static _onKeyPress?: (e: KeyboardEvent) => void;
    static _getTransform: () => Transform;
    static _addDocument: (doc: Doc | Doc[]) => void;
    static _addLiveTextDoc: (doc: Doc) => void;
    static _nudge: (x: number, y: number) => boolean;
    @observable static _clickPoint = [0, 0];
    @observable public static Visible = false;
    constructor(props: any) {
        super(props);
        document.addEventListener("keydown", this.onKeyPress);
        document.addEventListener("paste", this.paste);
    }

    paste = async (e: ClipboardEvent) => {
        if (PreviewCursor.Visible && e.clipboardData) {
            const newPoint = PreviewCursor._getTransform().transformPoint(PreviewCursor._clickPoint[0], PreviewCursor._clickPoint[1]);
            runInAction(() => PreviewCursor.Visible = false);

            // tests for URL and makes web document
            const re: any = /^https?:\/\//g;
            const plain = e.clipboardData.getData("text/plain");
            if (plain) {
                // tests for youtube and makes video document
                if (plain.indexOf("www.youtube.com/watch") !== -1) {
                    const url = plain.replace("youtube.com/watch?v=", "youtube.com/embed/");
                    undoBatch(() => PreviewCursor._addDocument(Docs.Create.VideoDocument(url, {
                        title: url, _width: 400, _height: 315, _nativeWidth: 600, _nativeHeight: 472.5,
                        x: newPoint[0], y: newPoint[1]
                    })))();
                }

                else if (re.test(plain)) {
                    const url = plain;
                    undoBatch(() => PreviewCursor._addDocument(Docs.Create.WebDocument(url, {
                        title: url, _width: 500, _height: 300, useCors: true, x: newPoint[0], y: newPoint[1]
                    })))();
                }
                else if (plain.startsWith("__DashDocId(") || plain.startsWith("__DashCloneId(")) {
                    const clone = plain.startsWith("__DashCloneId(");
                    const docids = plain.split(":");
                    const strs = docids[0].split(",");
                    const ptx = Number(strs[0].substring((clone ? "__DashCloneId(" : "__DashDocId(").length));
                    const pty = Number(strs[1].substring(0, strs[1].length - 1));

                    const batch = UndoManager.StartBatch("cloning");
                    {
                        const docs = await Promise.all(docids.filter((did, i) => i).map(async (did) => {
                            const doc = Cast(await DocServer.GetRefField(did), Doc, null);
                            return clone ? (await Doc.MakeClone(doc)).clone : doc;
                        }));
                        const firstx = docs.length ? NumCast(docs[0].x) + ptx - newPoint[0] : 0;
                        const firsty = docs.length ? NumCast(docs[0].y) + pty - newPoint[1] : 0;
                        docs.map(doc => {
                            doc.x = NumCast(doc.x) - firstx;
                            doc.y = NumCast(doc.y) - firsty;
                        });
                        PreviewCursor._addDocument(docs);
                    }
                    batch.end();
                    e.stopPropagation();
                }
                else {
                    // creates text document
                    FormattedTextBox.PasteOnLoad = e;
                    undoBatch(() => PreviewCursor._addLiveTextDoc(Docs.Create.TextDocument("", {
                        _width: 500,
                        limitHeight: 400,
                        _autoHeight: true,
                        _showTitle: Doc.UserDoc().showTitle ? "title" : undefined,
                        x: newPoint[0],
                        y: newPoint[1],
                        title: "-pasted text-"
                    })))();
                }
            } else
                //pasting in images
                if (e.clipboardData.getData("text/html") !== "" && e.clipboardData.getData("text/html").includes("<img src=")) {
                    const re: any = /<img src="(.*?)"/g;
                    const arr: any[] = re.exec(e.clipboardData.getData("text/html"));

                    undoBatch(() => PreviewCursor._addDocument(Docs.Create.ImageDocument(
                        arr[1], {
                        _width: 300, title: arr[1],
                        x: newPoint[0],
                        y: newPoint[1],
                    })))();
                } else if (e.clipboardData.items.length) {
                    const batch = UndoManager.StartBatch("collection view drop");
                    const files: File[] = [];
                    Array.from(e.clipboardData.items).forEach(item => {
                        const file = item.getAsFile();
                        file && files.push(file);
                    });
                    const generatedDocuments = await DocUtils.uploadFilesToDocs(files, { x: newPoint[0], y: newPoint[1] });
                    generatedDocuments.forEach(PreviewCursor._addDocument);
                    batch.end();
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
            e.key !== "NumLock" && e.key !== " " &&
            (e.keyCode < 112 || e.keyCode > 123) && // F1 thru F12 keys
            (e.keyCode < 173 || e.keyCode > 183 || e.key === "-") && // mute, volume up/down etc, - is there specifically because its keycode is 173 in Firefox so shouldn't be avoided
            !e.key.startsWith("Arrow") &&
            !e.defaultPrevented) {
            if ((!e.metaKey && !e.ctrlKey) || (e.keyCode >= 48 && e.keyCode <= 57) || (e.keyCode >= 65 && e.keyCode <= 90)) {//  /^[a-zA-Z0-9$*^%#@+-=_|}{[]"':;?/><.,}]$/.test(e.key)) {
                PreviewCursor.Visible && PreviewCursor._onKeyPress?.(e);
                ((!e.ctrlKey && !e.metaKey) || e.key !== "v") && (PreviewCursor.Visible = false);
            }
        } else if (PreviewCursor.Visible) {
            if (e.key === "ArrowRight") {
                PreviewCursor._nudge?.(1 * (e.shiftKey ? 2 : 1), 0) && e.stopPropagation();
            } else if (e.key === "ArrowLeft") {
                PreviewCursor._nudge?.(-1 * (e.shiftKey ? 2 : 1), 0) && e.stopPropagation();
            } else if (e.key === "ArrowUp") {
                PreviewCursor._nudge?.(0, 1 * (e.shiftKey ? 2 : 1)) && e.stopPropagation();
            } else if (e.key === "ArrowDown") {
                PreviewCursor._nudge?.(0, -1 * (e.shiftKey ? 2 : 1)) && e.stopPropagation();
            }
        }
    }

    //when focus is lost, this will remove the preview cursor
    @action onBlur = (): void => {
        PreviewCursor.Visible = false;
    }

    @action
    public static Show(x: number, y: number,
        onKeyPress: (e: KeyboardEvent) => void,
        addLiveText: (doc: Doc) => void,
        getTransform: () => Transform,
        addDocument: (doc: Doc | Doc[]) => boolean,
        nudge: (nudgeX: number, nudgeY: number) => boolean) {
        this._clickPoint = [x, y];
        this._onKeyPress = onKeyPress;
        this._addLiveTextDoc = addLiveText;
        this._getTransform = getTransform;
        this._addDocument = addDocument;
        this._nudge = nudge;
        this.Visible = true;
    }
    render() {
        return (!PreviewCursor._clickPoint || !PreviewCursor.Visible) ? (null) :
            <div className="previewCursor" onBlur={this.onBlur} tabIndex={0} ref={e => e && e.focus()}
                style={{ transform: `translate(${PreviewCursor._clickPoint[0]}px, ${PreviewCursor._clickPoint[1]}px)` }}>
                I
        </div >;
    }
}