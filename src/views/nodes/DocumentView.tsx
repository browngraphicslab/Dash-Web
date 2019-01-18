import { observer } from "mobx-react";
import React = require("react");
import { computed } from "mobx";
import { KeyStore, Key } from "../../fields/Key";
import { NumberField } from "../../fields/NumberField";
import { TextField } from "../../fields/TextField";
import { DocumentViewModel } from "../../viewmodels/DocumentViewModel";
import { ListField } from "../../fields/ListField";
import { FieldTextBox } from "../nodes/FieldTextBox"
import { FreeFormCanvas } from "../freeformcanvas/FreeFormCanvas"
import { CollectionFreeFormView } from "../freeformcanvas/CollectionFreeFormView"
import "./NodeView.scss"
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

interface IProps {
    dvm: DocumentViewModel;
}

@observer
export class DocumentView extends React.Component<IProps> {
    @computed
    get x(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.X, NumberField, Number(0));
    }

    @computed
    get y(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Y, NumberField, Number(0));
    }

    @computed
    get transform(): string {
        return `translate(${this.x}px, ${this.y}px)`;
    }

    @computed
    get width(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Width, NumberField, Number(0));
    }

    @computed
    get height(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Height, NumberField, Number(0));
    }

    @computed
    get layout(): string {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Layout, TextField, String("<p>Error loading layout data</p>"));
    }

    @computed
    get layoutKeys(): Key[] {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.LayoutKeys, ListField, new Array<Key>());
    }

    @computed
    get layoutFields(): Key[] {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.LayoutFields, ListField, new Array<Key>());
    }

    render() {
        let doc = this.props.dvm.Doc;
        let bindings: any = {
            doc: doc
        };
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key;
        }
        for (const key of this.layoutFields) {
            let field = doc.GetField(key);
            if (field) {
                bindings[key.Name] = field.GetValue();
            }
        }
        return (
            <div className="node" style={{
                transform: this.transform,
                width: this.width,
                height: this.height
            }}>
                <JsxParser
                    components={{ FieldTextBox, FreeFormCanvas, CollectionFreeFormView }}
                    bindings={bindings}
                    jsx={this.layout}
                />
            </div>
        );
    }

}