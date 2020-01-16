import { observer } from 'mobx-react';
import { makeInterface, listSpec } from '../../new_fields/Schema';
import { documentSchema } from '../../new_fields/documentSchemas';
import { CollectionSubView } from './collections/CollectionSubView';
import { DragManager } from '../util/DragManager';
import * as React from "react";
import { Doc, DocListCast } from '../../new_fields/Doc';
import { NumCast, Cast, StrCast } from '../../new_fields/Types';
import { List } from '../../new_fields/List';
import { ContentFittingDocumentView } from './nodes/ContentFittingDocumentView';
import { Utils } from '../../Utils';
import { Transform } from '../util/Transform';
import "./collectionMulticolumnView.scss";

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

@observer
export default class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {
    private _dropDisposer?: DragManager.DragDropDisposer;
    private get configuration() {
        const { Document } = this.props;
        if (!Document.multicolumnData) {
            Document.multicolumnData = new List<Doc>();
        }
        return DocListCast(this.Document.multicolumnData);
    }

    protected createDropTarget = (ele: HTMLDivElement) => {
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this));
        }
    }

    getTransform = (ele: React.RefObject<HTMLDivElement>) => () => {
        if (!ele.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(ele.current);
        return new Transform(-translateX, -translateY, 1 / scale);
    }

    public isCurrent(doc: Doc) { return !doc.isMinimized && (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    render() {
        const { PanelWidth } = this.props;
        return (
            <div className={"collectionMulticolumnView_outer"}>
                <div className={"collectionMulticolumnView_contents"}>
                    {this.configuration.map(config => {
                        const { target, columnWidth } = config;
                        if (target instanceof Doc) {
                            let computedWidth: number = 0;
                            const widthSpecifier = Cast(columnWidth, "number");
                            let matches: RegExpExecArray | null;
                            if (widthSpecifier !== undefined) {
                                computedWidth = widthSpecifier;
                            } else if ((matches = /([\d.]+)\%/.exec(StrCast(columnWidth))) !== null) {
                                computedWidth = Number(matches[1]) / 100 * PanelWidth();
                            }
                            return (!computedWidth ? (null) :
                                <ContentFittingDocumentView
                                    {...this.props}
                                    Document={target}
                                    DataDocument={undefined}
                                    PanelWidth={() => computedWidth}
                                    getTransform={this.props.ScreenToLocalTransform}
                                />
                            );
                        }
                        return (null);
                    })}
                </div>
            </div>
        );
    }

}