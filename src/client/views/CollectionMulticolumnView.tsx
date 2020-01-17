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
import { computed } from 'mobx';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

interface LayoutUnit {
    config: Doc;
    target: Doc;
}

interface Fixed extends LayoutUnit {
    pixels: number;
}

interface Proportional extends LayoutUnit {
    ratio: number;
}

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

    @computed
    private get layoutInformation() {
        const fixed: Fixed[] = [];
        const proportional: Proportional[] = [];
        let ratioSum = 0;
        for (const config of this.configuration) {
            const { columnWidth, target } = config;
            if (!(target instanceof Doc)) {
                // we're still waiting on promises, so it's not worth rendering anything yet
                return (null);
            }
            const widthSpecifier = Cast(columnWidth, "number");
            let matches: RegExpExecArray | null;
            if (widthSpecifier !== undefined) {
                // we've gotten a number, referring to a pixel value
                fixed.push({ config, target, pixels: widthSpecifier });
            } else if ((matches = /^(\d+(\.\d+)?)\*/.exec(StrCast(columnWidth))) !== null) {
                // we've gotten a proportional measure, like 1.8*
                const ratio = Number(matches[1]);
                ratioSum += ratio;
                proportional.push({ config, target, ratio });
            }
            // otherwise, the particular configuration entry is ignored and the remaining
            // space is allocated as if the document were absent from the configuration list
        }
        return { fixed, proportional, ratioSum };
    }

    @computed private get totalFixedPool() {
        return this.layoutInformation?.fixed.reduce((sum, unit) => sum + unit.pixels, 0);
    }

    @computed private get totalProportionalPool() {
        const { totalFixedPool } = this;
        return totalFixedPool !== undefined ? this.props.PanelWidth() - totalFixedPool : undefined;
    }

    @computed private get columnUnitLength() {
        const layout = this.layoutInformation;
        const { totalProportionalPool } = this;
        if (layout !== null && totalProportionalPool !== undefined) {
            const { ratioSum, proportional } = layout;
            return (totalProportionalPool - 2 * (proportional.length - 1)) / ratioSum;
        }
        return undefined;
    }

    @computed
    private get contents(): JSX.Element[] | null {
        const layout = this.layoutInformation;
        if (layout === null) {
            return (null);
        }
        const { fixed, proportional } = layout;
        const { columnUnitLength } = this;
        if (columnUnitLength === undefined) {
            return (null);
        }
        const { GenerateGuid } = Utils;
        const toView = ({ target, pixels }: Fixed) =>
            <ContentFittingDocumentView
                {...this.props}
                key={GenerateGuid()}
                Document={target}
                DataDocument={undefined}
                PanelWidth={() => pixels}
                getTransform={this.props.ScreenToLocalTransform}
            />;
        const collector: JSX.Element[] = fixed.map(toView);
        const resolvedColumns = proportional.map(({ target, ratio, config }) => ({ target, pixels: ratio * columnUnitLength, config }));
        for (let i = 0; i < resolvedColumns.length; i++) {
            collector.push(toView(resolvedColumns[i]));
            collector.push(
                <MulticolumnSpacer
                    key={GenerateGuid()}
                    columnBaseUnit={columnUnitLength}
                    toLeft={resolvedColumns[i].config}
                    toRight={resolvedColumns[i + 1]?.config}
                />
            );
        }
        collector.pop();
        return collector;
    }

    render() {
        return (
            <div className={"collectionMulticolumnView_contents"}>
                {this.contents}
            </div>
        );
    }

}

interface SpacerProps {
    columnBaseUnit: number;
    toLeft?: Doc;
    toRight?: Doc;
}

class MulticolumnSpacer extends React.Component<SpacerProps> {

    private registerResizing = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
    }

    private onPointerMove = ({ movementX }: PointerEvent) => {
        const { toLeft, toRight, columnBaseUnit } = this.props;
        const target = movementX > 0 ? toRight : toLeft;
        if (target) {
            let widthSpecifier = Number(StrCast(target.columnWidth).replace("*", ""));
            widthSpecifier -= Math.abs(movementX) / columnBaseUnit;
            target.columnWidth = `${widthSpecifier}*`;
        }
    }

    private onPointerUp = () => {
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div
                className={"spacer"}
                onPointerDown={this.registerResizing}
            />
        );
    }

}