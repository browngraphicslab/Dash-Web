import React = require('react');
import { observer } from "mobx-react";
import { observable } from 'mobx';

interface IProps {
    open: boolean;
}

@observer
export class MenuButton extends React.Component<IProps> {
    @observable static Instance: MenuButton;


}