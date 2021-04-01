import React = require("react");
import { observer } from "mobx-react";
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface } from "../../../fields/Schema";
import { returnFalse } from "../../../Utils";
import { CollectionTreeView } from "../collections/CollectionTreeView";
import { ViewBoxBaseComponent } from "../DocComponent";
import { StyleProp } from "../StyleProvider";
import { FieldView, FieldViewProps } from './FieldView';
import "./LinkBox.scss";

type LinkDocument = makeInterface<[typeof documentSchema]>;
const LinkDocument = makeInterface(documentSchema);

@observer
export class LinkBox extends ViewBoxBaseComponent<FieldViewProps, LinkDocument>(LinkDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(LinkBox, fieldKey); }
    isContentActiveFunc = () => this.isContentActive() ? true : false;
    render() {
        if (this.dataDoc.treeViewOpen === undefined) setTimeout(() => this.dataDoc.treeViewOpen = true);
        return <div className={`linkBox-container${this.isContentActive() ? "-interactive" : ""}`}
            style={{ background: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BackgroundColor) }} >
            <CollectionTreeView {...this.props}
                childDocuments={[this.dataDoc]}
                treeViewOpen={true}
                treeViewExpandedView={"fields"}
                treeViewHideTitle={true}
                treeViewSkipFields={["treeViewExpandedView", "aliases", "_removeDropProperties",
                    "treeViewOpen", "aliasNumber", "isPrototype", "creationDate", "author"]}
                dontRegisterView={true}
                renderDepth={this.props.renderDepth + 1}
                CollectionView={undefined}
                isContentActive={this.isContentActiveFunc}
                addDocument={returnFalse}
                removeDocument={returnFalse}
                moveDocument={returnFalse}>
            </CollectionTreeView>
        </div>;
    }
} 