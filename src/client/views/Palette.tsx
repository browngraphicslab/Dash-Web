import * as React from "react";
import "./Palette.scss";
import { PointData } from "../../new_fields/InkField";
import { Doc } from "../../new_fields/Doc";
import { Docs } from "../documents/Documents";
import { ScriptField, ComputedField } from "../../new_fields/ScriptField";
import { List } from "../../new_fields/List";
import { DocumentView } from "./nodes/DocumentView";
import { emptyPath, returnFalse, emptyFunction, returnOne, returnEmptyString, returnTrue } from "../../Utils";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import { Transform } from "../util/Transform";
import { computed, action, IReactionDisposer, reaction, observable } from "mobx";
import { FieldValue, Cast, NumCast } from "../../new_fields/Types";
import { observer } from "mobx-react";
import { DocumentContentsView } from "./nodes/DocumentContentsView";
import { CollectionStackingView } from "./collections/CollectionStackingView";
import { CollectionView } from "./collections/CollectionView";
import { CollectionSubView, SubCollectionViewProps } from "./collections/CollectionSubView";
import { makeInterface } from "../../new_fields/Schema";
import { documentSchema } from "../../new_fields/documentSchemas";

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
        this._selectedDisposer && this._selectedDisposer();
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
                            pinToPres={emptyFunction}
                            removeDocument={undefined}
                            onClick={undefined}
                            ScreenToLocalTransform={Transform.Identity}
                            ContentScaling={returnOne}
                            PanelWidth={() => window.screen.width}
                            PanelHeight={() => window.screen.height}
                            renderDepth={0}
                            focus={emptyFunction}
                            backgroundColor={returnEmptyString}
                            parentActive={returnTrue}
                            whenActiveChanged={emptyFunction}
                            bringToFront={emptyFunction}
                            ContainingCollectionView={undefined}
                            ContainingCollectionDoc={undefined}
                            zoomToScale={emptyFunction}
                            getScale={returnOne}>
                        </DocumentView>
                    </div>
                </div>
            </div>
        );
    }
}