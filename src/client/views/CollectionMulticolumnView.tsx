import { observer } from 'mobx-react';
import { makeInterface } from '../../new_fields/Schema';
import { documentSchema } from '../../new_fields/documentSchemas';
import { CollectionSubView, SubCollectionViewProps } from './collections/CollectionSubView';
import { DragManager } from '../util/DragManager';
import * as React from "react";
import { Doc } from '../../new_fields/Doc';
import { NumCast } from '../../new_fields/Types';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

@observer
export default class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {
    private _dropDisposer?: DragManager.DragDropDisposer;

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);
        const { Document } = this.props;
        Document.multicolumnData = new Doc();
    }

    protected createDropTarget = (ele: HTMLDivElement) => {
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this));
        }
    }

    public isCurrent(doc: Doc) { return !doc.isMinimized && (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    render() {
        return (
            <div className={"collectionMulticolumnView_outer"}>
                <div className={"collectionMulticolumnView_contents"}>
                    {this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(({ layout, data }) => {

                    })}
                </div>
            </div>
        );
    }

}