import { CollectionSubView } from "./CollectionSubView";
import { InkingCanvas } from "../InkingCanvas";
import { Transform } from "../../util/Transform";
import React = require("react")
import { computed, action, IReactionDisposer, reaction, runInAction, observable } from "mobx";
import { Doc, HeightSym } from "../../../new_fields/Doc";
import { NumCast } from "../../../new_fields/Types";
import "./CollectionStaffView.scss";
import { observer } from "mobx-react";

@observer
export class CollectionStaffView extends CollectionSubView(doc => doc) {
    private getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(0, -this._mainCont.current!.scrollTop);
    private _mainCont = React.createRef<HTMLDivElement>();
    private _reactionDisposer: IReactionDisposer | undefined;
    @observable private _staves = NumCast(this.props.Document.staves);

    componentDidMount = () => {
        this._reactionDisposer = reaction(
            () => NumCast(this.props.Document.staves),
            (staves) => runInAction(() => this._staves = staves)
        );

        this.props.Document.staves = 5;
    }

    @computed get fieldExtensionDoc() {
        return Doc.fieldExtensionDoc(this.props.DataDoc || this.props.Document, this.props.fieldKey);
    }

    @computed get addStaffButton() {
        return <div onPointerDown={this.addStaff}>+</div>;
    }

    @computed get staves() {
        let staves = [];
        for (let i = 0; i < this._staves; i++) {
            let rows = [];
            for (let j = 0; j < 5; j++) {
                rows.push(<div key={`staff-${i}-${j}`} className="collectionStaffView-line"></div>)
            }
            staves.push(<div key={`staff-${i}`} className="collectionStaffView-staff">
                {rows}
            </div>);
        }
        return staves;
    }

    @action
    addStaff = (e: React.PointerEvent) => {
        this.props.Document.staves = this._staves + 1;
    }

    render() {
        return (
            <div className="collectionStaffView" ref={this._mainCont}>
                <InkingCanvas getScreenTransform={this.getTransform} Document={this.props.Document} AnnotationDocument={this.fieldExtensionDoc} inkFieldKey={"ink"} >
                    {() => []}
                </InkingCanvas>
                {this.staves}
                {this.addStaffButton}
            </div>
        )
    }
}