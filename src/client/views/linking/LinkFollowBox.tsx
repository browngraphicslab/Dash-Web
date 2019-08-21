import { observable, computed, action, trace } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { FieldViewProps, FieldView } from "../nodes/FieldView";

@observer
export class LinkFollowBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(LinkFollowBox); }
}