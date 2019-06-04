import { action, observable, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { emptyFunction, returnTrue, returnZero } from '../../Utils';
import { DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import "normalize.css";
import "./MainOverlayTextBox.scss";
import { FormattedTextBox } from './nodes/FormattedTextBox';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { Doc } from '../../new_fields/Doc';

interface MainOverlayTextBoxProps {
}

@observer
export class MainOverlayTextBox extends React.Component<MainOverlayTextBoxProps> {
    public static Instance: MainOverlayTextBox;
    @observable _textXf: () => Transform = () => Transform.Identity();
    private _textFieldKey: string = "data";
    private _textColor: string | null = null;
    private _textHideOnLeave?: boolean;
    private _textTargetDiv: HTMLDivElement | undefined;
    private _textProxyDiv: React.RefObject<HTMLDivElement>;

    constructor(props: MainOverlayTextBoxProps) {
        super(props);
        this._textProxyDiv = React.createRef();
        MainOverlayTextBox.Instance = this;
        reaction(() => FormattedTextBox.InputBoxOverlay,
            (box?: FormattedTextBox) => {
                if (box) this.setTextDoc(box.props.fieldKey, box.CurrentDiv, box.props.ScreenToLocalTransform);
                else this.setTextDoc();
            });
    }

    @action
    private setTextDoc(textFieldKey?: string, div?: HTMLDivElement, tx?: () => Transform) {
        if (this._textTargetDiv) {
            this._textTargetDiv.style.color = this._textColor;
        }
        this._textFieldKey = textFieldKey!;
        this._textXf = tx ? tx : () => Transform.Identity();
        this._textTargetDiv = div;
        this._textHideOnLeave = FormattedTextBox.InputBoxOverlay && FormattedTextBox.InputBoxOverlay.props.hideOnLeave;
        if (div) {
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
        if (e.movementX > 1 || e.movementY > 1) {
            document.removeEventListener("pointermove", this.textBoxMove);
            document.removeEventListener('pointerup', this.textBoxUp);
            let dragData = new DragManager.DocumentDragData(FormattedTextBox.InputBoxOverlay ? [FormattedTextBox.InputBoxOverlay.props.Document] : []);
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

    addDocTab = (doc: Doc, location: string) => {
        if (true) { // location === "onRight") { need to figure out stack to add "inTab"
            CollectionDockingView.Instance.AddRightSplit(doc);
        }
    }
    render() {
        if (FormattedTextBox.InputBoxOverlay && this._textTargetDiv) {
            let textRect = this._textTargetDiv.getBoundingClientRect();
            let s = this._textXf().Scale;
            return <div className="mainOverlayTextBox-textInput" style={{ transform: `translate(${textRect.left}px, ${textRect.top}px) scale(${1 / s},${1 / s})`, width: "auto", height: "auto" }} >
                <div className="mainOverlayTextBox-textInput" onPointerDown={this.textBoxDown} ref={this._textProxyDiv} onScroll={this.textScroll}
                    style={{ width: `${textRect.width * s}px`, height: `${textRect.height * s}px` }}>
                    <FormattedTextBox fieldKey={this._textFieldKey} hideOnLeave={this._textHideOnLeave} isOverlay={true} Document={FormattedTextBox.InputBoxOverlay.props.Document} isSelected={returnTrue} select={emptyFunction} isTopMost={true}
                        selectOnLoad={true} ContainingCollectionView={undefined} whenActiveChanged={emptyFunction} active={returnTrue}
                        ScreenToLocalTransform={this._textXf} PanelWidth={returnZero} PanelHeight={returnZero} focus={emptyFunction} addDocTab={this.addDocTab} />
                </div>
            </ div>;
        }
        else return (null); Z
    }
}