import { IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc } from "../../new_fields/Doc";
import { NumCast } from "../../new_fields/Types";
import { emptyFunction, emptyPath, returnEmptyString, returnZero, returnFalse, returnOne, returnTrue } from "../../Utils";
import { Transform } from "../util/Transform";
import { DocumentView } from "./nodes/DocumentView";
import "./Palette.scss";

export interface PaletteProps {
    x: number;
    y: number;
    thumb: number[];
    thumbDoc: Doc;
}

@observer
export default class Palette extends React.Component<PaletteProps> {
    private _selectedDisposer?: IReactionDisposer;
    @observable private _selectedIndex: number = 0;

    componentDidMount = () => {
        this._selectedDisposer = reaction(
            () => NumCast(this.props.thumbDoc.selectedIndex),
            (i) => this._selectedIndex = i,
            { fireImmediately: true }
        );
    }

    componentWillUnmount = () => {
        this._selectedDisposer?.();
    }

    render() {
        return (
            <div className="palette-container" style={{ transform: `translate(${this.props.x}px, ${this.props.y}px)` }}>
                <div className="palette-thumb" style={{ transform: `translate(${this.props.thumb[0] - this.props.x}px, ${this.props.thumb[1] - this.props.y}px)` }}>
                    <div className="palette-thumbContent" style={{ transform: `translate(-${(this._selectedIndex * 50) + 10}px, 0px)` }}>
                        <DocumentView
                            Document={this.props.thumbDoc}
                            DataDoc={undefined}
                            LibraryPath={emptyPath}
                            addDocument={undefined}
                            addDocTab={returnFalse}
                            rootSelected={returnTrue}
                            pinToPres={emptyFunction}
                            removeDocument={undefined}
                            onClick={undefined}
                            ScreenToLocalTransform={Transform.Identity}
                            ContentScaling={returnOne}
                            NativeHeight={returnZero}
                            NativeWidth={returnZero}
                            PanelWidth={() => window.screen.width}
                            PanelHeight={() => window.screen.height}
                            renderDepth={0}
                            focus={emptyFunction}
                            backgroundColor={returnEmptyString}
                            parentActive={returnTrue}
                            whenActiveChanged={emptyFunction}
                            bringToFront={emptyFunction}
                            ContainingCollectionView={undefined}
                            ContainingCollectionDoc={undefined} />
                        <div className="palette-cover" style={{ transform: `translate(${Math.max(0, this._selectedIndex) * 50.75 + 23}px, 0px)` }}></div>
                    </div>
                </div>
            </div>
        );
    }
}