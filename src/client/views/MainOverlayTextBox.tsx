import { action, observable, reaction, trace } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { Doc } from '../../new_fields/Doc';
import { BoolCast } from '../../new_fields/Types';
import { emptyFunction, returnTrue, returnZero, Utils, returnOne } from '../../Utils';
import { DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { CollectionDockingView } from './collections/CollectionDockingView';
import "./MainOverlayTextBox.scss";
import { FormattedTextBox } from './nodes/FormattedTextBox';

interface MainOverlayTextBoxProps {
    firstinstance?: boolean;
}

@observer
export class MainOverlayTextBox extends React.Component<MainOverlayTextBoxProps> {
    public static Instance: MainOverlayTextBox;
    @observable _textXf: () => Transform = () => Transform.Identity();
    public TextFieldKey: string = "data";
    private _textColor: string | null = null;
    private _textHideOnLeave?: boolean;
    private _textTargetDiv: HTMLDivElement | undefined;
    private _textProxyDiv: React.RefObject<HTMLDivElement>;
    private _textBottom: boolean | undefined;
    private _textAutoHeight: boolean | undefined;
    private _setouterdiv = (outerdiv: HTMLElement | null) => { this._outerdiv = outerdiv; this.updateTooltip(); };
    private _outerdiv: HTMLElement | null = null;
    private _textBox: FormattedTextBox | undefined;
    private _tooltip?: HTMLElement;
    ChromeHeight?: () => number;
    @observable public TextDoc?: Doc;
    @observable public TextDataDoc?: Doc;

    updateTooltip = () => {
        this._outerdiv && this._tooltip && !this._outerdiv.contains(this._tooltip) && this._outerdiv.appendChild(this._tooltip);
    }

    public SetColor(color: string) {
        return this._textBox && this._textBox.setFontColor(color);
    }


    constructor(props: MainOverlayTextBoxProps) {
        super(props);
        this._textProxyDiv = React.createRef();
        MainOverlayTextBox.Instance = this;
        reaction(() => FormattedTextBox.InputBoxOverlay,
            (box?: FormattedTextBox) => {
                this._textBox = box;
                if (box) {
                    this.ChromeHeight = box.props.ChromeHeight;
                    this.TextDoc = box.props.Document;
                    this.TextDataDoc = box.props.DataDoc;
                    let xf = () => {
                        box.props.ScreenToLocalTransform();
                        let sxf = Utils.GetScreenTransform(box ? box.CurrentDiv : undefined);
                        return new Transform(-sxf.translateX, -sxf.translateY, 1 / sxf.scale);
                    };
                    this.setTextDoc(box.props.fieldKey, box.CurrentDiv, xf, BoolCast(box.props.Document.autoHeight, false) || box.props.height === "min-content");
                }
                else {
                    this.TextDoc = undefined;
                    this.TextDataDoc = undefined;
                    this.setTextDoc();
                }
            });
    }

    @action
    private setTextDoc(textFieldKey?: string, div?: HTMLDivElement, tx?: () => Transform, autoHeight?: boolean) {
        if (this._textTargetDiv) {
            this._textTargetDiv.style.color = this._textColor;
        }
        this._textAutoHeight = autoHeight;
        this.TextFieldKey = textFieldKey!;
        let txf = tx ? tx : () => Transform.Identity();
        this._textXf = txf;
        this._textTargetDiv = div;
        this._textHideOnLeave = FormattedTextBox.InputBoxOverlay && FormattedTextBox.InputBoxOverlay.props.hideOnLeave;
        if (div) {
            this._textBottom = div.parentElement && div.parentElement.style.bottom ? true : false;
            this._textColor = (getComputedStyle(div) as any).color;
            div.style.color = "transparent";
        }
    }

    @action
    textScroll = (e: React.UIEvent) => {
        if (this._textProxyDiv.current && this._textTargetDiv) {
            this._textTargetDiv.scrollTop = (e as any)._targetInst.stateNode.scrollTop;
        }
    }

    textBoxDown = (e: React.PointerEvent) => {
        if (e.button !== 0 || e.metaKey || e.altKey) {
            document.addEventListener("pointermove", this.textBoxMove);
            document.addEventListener('pointerup', this.textBoxUp);
        }
    }
    @action
    textBoxMove = (e: PointerEvent) => {
        if ((e.movementX > 1 || e.movementY > 1) && FormattedTextBox.InputBoxOverlay) {
            document.removeEventListener("pointermove", this.textBoxMove);
            document.removeEventListener('pointerup', this.textBoxUp);
            let dragData = new DragManager.DocumentDragData([FormattedTextBox.InputBoxOverlay.props.Document], [FormattedTextBox.InputBoxOverlay.props.DataDoc]);
            const [left, top] = this._textXf().inverse().transformPoint(0, 0);
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

    addDocTab = (doc: Doc, dataDoc: Doc | undefined, location: string) => {
        if (true) { // location === "onRight") { need to figure out stack to add "inTab"
            CollectionDockingView.Instance.AddRightSplit(doc, dataDoc);
        }
    }
    render() {
        this.TextDoc; this.TextDataDoc;
        if (FormattedTextBox.InputBoxOverlay && this._textTargetDiv) {
            let textRect = this._textTargetDiv.getBoundingClientRect();
            let s = this._textXf().Scale;
            let location = this._textBottom ? textRect.bottom : textRect.top;
            let hgt = this._textAutoHeight || this._textBottom ? "auto" : this._textTargetDiv.clientHeight;
            return <div ref={this._setouterdiv} className="mainOverlayTextBox-unscaled_div" style={{ transform: `translate(${textRect.left}px, ${location}px)` }} >
                <div className="mainOverlayTextBox-textInput" style={{ transform: `scale(${1 / s},${1 / s})`, width: "auto", height: "0px" }} >
                    <div className="mainOverlayTextBox-textInput" onPointerDown={this.textBoxDown} ref={this._textProxyDiv} onScroll={this.textScroll}
                        style={{ width: `${textRect.width * s}px`, height: "0px" }}>
                        <div style={{ height: hgt, width: "100%", position: "absolute", bottom: this._textBottom ? "0px" : undefined }}>
                            <FormattedTextBox color={`${this._textColor}`} fieldKey={this.TextFieldKey} fieldExt="" hideOnLeave={this._textHideOnLeave} isOverlay={true}
                                Document={FormattedTextBox.InputBoxOverlay.props.Document}
                                DataDoc={FormattedTextBox.InputBoxOverlay.props.DataDoc}
                                onClick={emptyFunction}
                                isSelected={returnTrue} select={emptyFunction} renderDepth={0} selectOnLoad={true}
                                ContainingCollectionView={undefined} whenActiveChanged={emptyFunction} active={returnTrue} ContentScaling={returnOne}
                                ScreenToLocalTransform={this._textXf} PanelWidth={returnZero} PanelHeight={returnZero} focus={emptyFunction} addDocTab={this.addDocTab} />
                        </div>
                    </div>
                </div>
            </ div>;
        }
        else return (null);
    }
}