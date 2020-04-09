import React = require("react");
import { observer } from "mobx-react";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { makeInterface, listSpec } from "../../../new_fields/Schema";
import { returnFalse, returnZero } from "../../../Utils";
import { CollectionTreeView } from "../collections/CollectionTreeView";
import { DocExtendableComponent } from "../DocComponent";
import { FieldView, FieldViewProps } from './FieldView';
import "./LinkBox.scss";
import { Cast } from "../../../new_fields/Types";

type LinkDocument = makeInterface<[typeof documentSchema]>;
const LinkDocument = makeInterface(documentSchema);

@observer
export class LinkBox extends DocExtendableComponent<FieldViewProps, LinkDocument>(LinkDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(LinkBox, fieldKey); }
    render() {
        return <div className={`linkBox-container${this.active() ? "-interactive" : ""}`}
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()}
            style={{ background: this.props.backgroundColor?.(this.props.Document) }} >

            <CollectionTreeView {...this.props}
                ChromeHeight={returnZero}
                overrideDocuments={[this.dataDoc]}
                NativeHeight={returnZero}
                NativeWidth={returnZero}
                ignoreFields={Cast(this.props.Document.linkBoxExcludedKeys, listSpec("string"), null)}
                annotationsKey={""}
                CollectionView={undefined}
                addDocument={returnFalse}
                removeDocument={returnFalse}
                moveDocument={returnFalse}>
            </CollectionTreeView>
        </div>;
    }
} 