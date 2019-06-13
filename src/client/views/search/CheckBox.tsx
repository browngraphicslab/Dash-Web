import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./CheckBox.scss";

interface CheckBoxProps {
    originalStatus: boolean;
    updateStatus(newStatus: boolean): void;
    title: string;
}

@observer
export class CheckBox extends React.Component<CheckBoxProps>{
    @observable _status: boolean;

    constructor(props: CheckBoxProps) {
        super(props);

        this._status = this.props.originalStatus;
    }

    onClick = () => {
        this._status = !this._status;
        this.props.updateStatus(this._status);
    }

    render() {
        return (
            <div className="checkbox">
                <div className="check-box">
                    <svg viewBox="10 10 20 20">
                        <path className="checkmark" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                    </svg>
                </div>
                <div className="checkbox-title">{this.props.title}</div>
            </div>
        )
    }

}