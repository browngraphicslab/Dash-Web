import { action, observable, trace } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Document } from '../../fields/Document';
import { Key } from '../../fields/Key';
import { KeyStore } from '../../fields/KeyStore';
import { emptyDocFunction, emptyFunction, returnTrue } from '../../Utils';
import '../northstar/model/ModelExtensions';
import '../northstar/utils/Extensions';
import { DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import "./MainOverlayTextBox.scss";
import { FormattedTextBox } from './nodes/FormattedTextBox';

interface MainOverlayTextBoxProps {
}

@observer
export class MainOverlayTextBox extends React.Component<MainOverlayTextBoxProps> {
    public static Instance: MainOverlayTextBox;
    @observable public TextDoc?: Document = undefined;
    public TextScroll: number = 0;
    private _textRect: any;
    private _textXf: Transform = Transform.Identity();
    private _textFieldKey: Key = KeyStore.Data;
    private _textColor: string | null = null;
    private _textTargetDiv: HTMLDivElement | undefined;
    private _textProxyDiv: React.RefObject<HTMLDivElement>;

    constructor(props: MainOverlayTextBoxProps) {
        super(props);
        this._textProxyDiv = React.createRef();
        MainOverlayTextBox.Instance = this;
    }

    @action
    SetTextDoc(textDoc?: Document, textFieldKey?: Key, div?: HTMLDivElement, tx?: Transform) {
        if (this._textTargetDiv) {
            this._textTargetDiv.style.color = this._textColor;
        }

        this.TextDoc = textDoc;
        this._textFieldKey = textFieldKey!;
        this._textXf = tx ? tx : Transform.Identity();
        this._textTargetDiv = div;
        if (div) {
            this._textColor = div.style.color;
            div.style.color = "transparent";
            this._textRect = div.getBoundingClientRect();
            this.TextScroll = div.scrollTop;
        }
    }

    @action
    textScroll = (e: React.UIEvent) => {
        if (this._textProxyDiv.current && this._textTargetDiv) {
            this.TextScroll = (e as any)._targetInst.stateNode.scrollTop;//  this._textProxyDiv.current.children[0].scrollTop;
            this._textTargetDiv.scrollTop = this.TextScroll;
        }
    }

    textBoxDown = (e: React.PointerEvent) => {
        if (e.button !== 0 || e.metaKey || e.altKey) {
            document.addEventListener("pointermove", this.textBoxMove);
            document.addEventListener('pointerup', this.textBoxUp);
        }
    }
    textBoxMove = (e: PointerEvent) => {
        if (e.movementX > 1 || e.movementY > 1) {
            document.removeEventListener("pointermove", this.textBoxMove);
            document.removeEventListener('pointerup', this.textBoxUp);
            let dragData = new DragManager.DocumentDragData([this.TextDoc!]);
            const [left, top] = this._textXf
                .inverse()
                .transformPoint(0, 0);
            dragData.xOffset = e.clientX - left;
            dragData.yOffset = e.clientY - top;
            DragManager.StartDocumentDrag([this._textTargetDiv!], dragData, e.clientX, e.clientY, {
                handlers: {
                    dragComplete: action(emptyFunction),
                },
                hideSource: false
            });
        }
    }
    textBoxUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.textBoxMove);
        document.removeEventListener('pointerup', this.textBoxUp);
    }

    render() {
        if (this.TextDoc) {
            let x: number = this._textRect.x;
            let y: number = this._textRect.y;
            let w: number = this._textRect.width;
            let h: number = this._textRect.height;
            let t = this._textXf.transformPoint(0, 0);
            let s = this._textXf.transformPoint(1, 0);
            s[0] = Math.sqrt((s[0] - t[0]) * (s[0] - t[0]) + (s[1] - t[1]) * (s[1] - t[1]));
            return <div className="mainOverlayTextBox-textInput" style={{ pointerEvents: "none", transform: `translate(${x}px, ${y}px) scale(${1 / s[0]},${1 / s[0]})`, width: "auto", height: "auto" }} >
                <div className="mainOverlayTextBox-textInput" onPointerDown={this.textBoxDown} ref={this._textProxyDiv} onScroll={this.textScroll} style={{ pointerEvents: "none", transform: `scale(${1}, ${1})`, width: `${w * s[0]}px`, height: `${h * s[0]}px` }}>
                    <FormattedTextBox fieldKey={this._textFieldKey} isOverlay={true} Document={this.TextDoc} isSelected={returnTrue} select={emptyFunction} isTopMost={true}
                        selectOnLoad={true} ContainingCollectionView={undefined} onActiveChanged={emptyFunction} active={returnTrue} ScreenToLocalTransform={() => this._textXf} focus={emptyDocFunction} />
                </div>
            </ div>;
        }
        else return (null);
    }
}