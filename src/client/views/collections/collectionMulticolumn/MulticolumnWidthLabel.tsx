import * as React from "react";
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Doc } from "../../../../new_fields/Doc";
import { NumCast, StrCast, BoolCast } from "../../../../new_fields/Types";

interface WidthLabelProps {
    layout: Doc;
    collectionDoc: Doc;
    decimals?: number;
}

@observer
export default class WidthLabel extends React.Component<WidthLabelProps> {

    @computed
    private get contents() {
        const { layout, decimals } = this.props;
        const magnitude = +NumCast(layout.widthMagnitude).toFixed(decimals ?? 3);
        const unit = StrCast(layout.widthUnit);
        return <span className={"display"}>{magnitude} {unit}</span>;
    }

    render() {
        return BoolCast(this.props.collectionDoc.showWidthLabels) ? this.contents : (null);
    }

}