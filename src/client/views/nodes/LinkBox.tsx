import React = require("react");
import { observer } from "mobx-react";
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface, listSpec } from "../../../fields/Schema";
import { returnFalse, returnZero } from "../../../Utils";
import { CollectionTreeView } from "../collections/CollectionTreeView";
import { ViewBoxBaseComponent } from "../DocComponent";
import { FieldView, FieldViewProps } from './FieldView';
import "./LinkBox.scss";
import { Cast } from "../../../fields/Types";

type LinkDocument = makeInterface<[typeof documentSchema]>;
const LinkDocument = makeInterface(documentSchema);

@observer
export class LinkBox extends ViewBoxBaseComponent<FieldViewProps, LinkDocument>(LinkDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(LinkBox, fieldKey); }
    render() {
        return <div className={`linkBox-container${this.active() ? "-interactive" : ""}`}
            style={{ background: this.props.styleProvider?.(this.props.Document, this.props, "backgroundColor") }} >

            <CollectionTreeView {...this.props}
                ChromeHeight={returnZero}
                childDocuments={[this.dataDoc]}
                treeViewSkipFields={Cast(this.props.Document.linkBoxExcludedKeys, listSpec("string"), null)}
                dontRegisterView={true}
                renderDepth={this.props.renderDepth + 1}
                CollectionView={undefined}
                addDocument={returnFalse}
                removeDocument={returnFalse}
                moveDocument={returnFalse}>
            </CollectionTreeView>
        </div>;
    }
} 