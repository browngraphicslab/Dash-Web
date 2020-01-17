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

interface UnitBase {
    config: Doc;
    target: Doc;
}

type WidthSpecifier = { pixels: number } | { ratio: number };
interface LayoutUnit extends UnitBase {
    specifier: WidthSpecifier;
}

interface Fixed extends UnitBase {
    specifier: { pixels: number };
}

interface Ratio extends UnitBase {
    specifier: { ratio: number };
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
        const values: LayoutUnit[] = [];
        let ratioSum = 0;
        let fixedCount = 0;
        let ratioCount = 0;
        for (const config of this.configuration) {
            const { columnWidth, target } = config;
            if (!(target instanceof Doc)) {
                // we're still waiting on promises, so it's not worth rendering anything yet
                return (null);
            }
            const widthSpecifier = Cast(columnWidth, "number");
            let matches: RegExpExecArray | null;
            let specifier: WidthSpecifier | null = null;
            if (widthSpecifier !== undefined) {
                // we've gotten a number, referring to a pixel value
                specifier = { pixels: widthSpecifier };
                fixedCount++;
            } else if ((matches = /^(\d+(\.\d+)?)\*/.exec(StrCast(columnWidth))) !== null) {
                // we've gotten a proportional measure, like 1.8*
                const ratio = Number(matches[1]);
                ratioSum += ratio;
                specifier = { ratio };
                ratioCount++;
            }
            if (specifier !== null) {
                values.push({ config, target, specifier });
            }
            // otherwise, the particular configuration entry is ignored and the remaining
            // space is allocated as if the document were absent from the configuration list
        }
        return { values, ratioCount, fixedCount, ratioSum };
    }

    @computed private get totalFixedPool() {
        const fixed: Fixed[] = [];
        const layout = this.layoutInformation;
        if (!layout) {
            return undefined;
        }
        layout.values.forEach(unit => {
            ("pixels" in unit.specifier) && fixed.push(unit as Fixed);
        });
        return fixed.reduce((sum, unit) => sum + unit.specifier.pixels, 0);
    }

    @computed private get totalProportionalPool() {
        const { totalFixedPool } = this;
        return totalFixedPool !== undefined ? this.props.PanelWidth() - totalFixedPool : undefined;
    }

    @computed private get columnUnitLength() {
        const layout = this.layoutInformation;
        const { totalProportionalPool } = this;
        if (layout !== null && totalProportionalPool !== undefined) {
            const { ratioSum, values } = layout;
            return (totalProportionalPool - 2 * (values.length - 1)) / ratioSum;
        }
        return undefined;
    }

    @computed
    private get contents(): JSX.Element[] | null {
        const layout = this.layoutInformation;
        if (layout === null) {
            return (null);
        }
        const { values } = layout;
        const { columnUnitLength } = this;
        if (columnUnitLength === undefined) {
            return (null);
        }
        const { GenerateGuid } = Utils;
        const toView = ({ target, specifier: { pixels } }: Fixed) =>
            <ContentFittingDocumentView
                {...this.props}
                key={GenerateGuid()}
                Document={target}
                DataDocument={undefined}
                PanelWidth={() => pixels}
                getTransform={this.props.ScreenToLocalTransform}
            />;
        const resolved: Fixed[] = [];
        values.forEach(value => {
            const { specifier, ...remaining } = value;
            if ("ratio" in specifier) {
                resolved.push({ ...remaining, specifier: { pixels: specifier.ratio * columnUnitLength } });
            } else {
                resolved.push(value as Fixed);
            }
        });
        const collector: JSX.Element[] = [];
        for (let i = 0; i < resolved.length; i++) {
            collector.push(toView(resolved[i]));
            collector.push(
                <MulticolumnSpacer
                    key={GenerateGuid()}
                    columnBaseUnit={columnUnitLength}
                    toLeft={resolved[i].config}
                    toRight={resolved[i + 1]?.config}
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