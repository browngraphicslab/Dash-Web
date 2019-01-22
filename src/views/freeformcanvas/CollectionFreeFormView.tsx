import { observer } from "mobx-react";
import { Key, KeyStore } from "../../fields/Key";
import "./FreeFormCanvas.scss";
import React = require("react");
import { action, observable } from "mobx";
import { Document } from "../../fields/Document";
import { DocumentViewModel } from "../../viewmodels/DocumentViewModel";
import { DocumentView } from "../nodes/DocumentView";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { SSL_OP_SINGLE_DH_USE } from "constants";
import { DocumentDecorations } from "../../DocumentDecorations";
import { SelectionManager } from "../../util/SelectionManager";
import { Documents } from "../../documents/Documents";
import { ContextMenu } from "../ContextMenu";

interface IProps {
    fieldKey: Key;
    dvm: DocumentViewModel;
    isSelected: boolean;
}

@observer
export class CollectionFreeFormView extends React.Component<IProps> {

    private _isPointerDown: boolean = false;

    constructor(props: IProps) {
        super(props);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (!this.props.isSelected && !this.props.dvm.IsMainDoc) {
            return;
        }

        if (this.props.dvm.IsMainDoc) {
            SelectionManager.DeselectAll()
        }

        e.stopPropagation();
        if (e.button === 2) {
            this._isPointerDown = true;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 2) {
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (!this._isPointerDown) {
            return;
        }
        const { dvm } = this.props;
        const doc = dvm.Doc;

        let x = doc.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        let y = doc.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        doc.SetFieldValue(KeyStore.PanX, x + e.movementX, NumberField);
        doc.SetFieldValue(KeyStore.PanY, y + e.movementY, NumberField);

        DocumentDecorations.Instance.forceUpdate()
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();

        let scaleAmount = 1 - (e.deltaY / 1000);
        let currScale = this.props.dvm.Doc.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
        this.props.dvm.Doc.SetField(KeyStore.Scale, new NumberField(currScale * scaleAmount));

        const panx: number = this.props.dvm.Doc.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        const pany: number = this.props.dvm.Doc.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        let dx = (e.pageX - window.screen.width / 2) * currScale * (scaleAmount - 1)
        let dy = (e.pageY - window.screen.height / 2) * currScale * (scaleAmount - 1)

        this.props.dvm.Doc.SetFieldValue(KeyStore.PanX, panx - dx, NumberField);
        this.props.dvm.Doc.SetFieldValue(KeyStore.PanY, pany - dy, NumberField);

        DocumentDecorations.Instance.forceUpdate()
    }

    onDrop = (e: React.DragEvent): void => {
        e.stopPropagation()
        e.preventDefault()
        let fReader = new FileReader()
        let file = e.dataTransfer.items[0].getAsFile();
        let that = this;
        const panx: number = this.props.dvm.Doc.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        const pany: number = this.props.dvm.Doc.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        let x = e.pageX - panx
        let y = e.pageY - pany

        fReader.addEventListener("load", action("drop", (event) => {
            if (fReader.result) {
                let url = "" + fReader.result;
                let doc = Documents.ImageDocument(url, {
                    x: x, y: y
                })
                let docs = that.props.dvm.Doc.GetFieldT(KeyStore.Data, ListField);
                if (!docs) {
                    docs = new ListField<Document>();
                    that.props.dvm.Doc.SetField(KeyStore.Data, docs)
                }
                docs.Data.push(doc);
            }
        }), false)

        if (file) {
            fReader.readAsDataURL(file)
        }
    }

    @action
    removeDocument = (doc: Document): void => {
        const value: Document[] = this.props.dvm.Doc.GetFieldValue(this.props.fieldKey, ListField, [])
        if (value.indexOf(doc) !== -1) {
            value.splice(value.indexOf(doc), 1)

            SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
        }
    }

    onDragOver = (e: React.DragEvent): void => {
        // console.log(e.dataTransfer)
    }

    render() {
        const { fieldKey, dvm } = this.props;
        
        const value: Document[] = dvm.Doc.GetFieldValue(fieldKey, ListField, []);
        const panx: number = dvm.Doc.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        const pany: number = dvm.Doc.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        const currScale: number = dvm.Doc.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
        // DocumentDecorations.Instance.forceUpdate()
        return (
            <div className="border" style={{
                    borderStyle: "solid",
                    borderWidth: "2px"
                }}>
                <div className="collectionfreeformview-container" onPointerDown={this.onPointerDown} onWheel={this.onPointerWheel} onContextMenu={(e) => e.preventDefault()} style={{
                    width: "100%",
                    height: "calc(100% - 4px)",
                    overflow: "hidden"
                }} onDrop={this.onDrop} onDragOver={this.onDragOver}>
                    <div className="collectionfreeformview" style={{ transform: `translate(${panx}px, ${pany}px) scale(${currScale}, ${currScale})`, transformOrigin: `50%, 50%`}}>
                        
                        <div className="node-container">
                            {value.map(doc => {
                                return (<DocumentView key={doc.Id} parent={this} dvm={new DocumentViewModel(doc)} />);
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}