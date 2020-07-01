import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import GroupManager, { UserOptions } from "./GroupManager";
import { library } from "@fortawesome/fontawesome-svg-core";
import { StrCast } from "../../fields/Types";
import { action } from "mobx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as fa from '@fortawesome/free-solid-svg-icons';
import Select from "react-select";
import { Doc } from "../../fields/Doc";
import "./GroupMemberView.scss";

library.add(fa.faWindowClose);

interface GroupMemberViewProps {
    group: Doc;
    onCloseButtonClick: () => void;
}

@observer
export default class GroupMemberView extends React.Component<GroupMemberViewProps> {

    private get editingInterface() {
        const members: string[] = this.props.group ? JSON.parse(StrCast(this.props.group.members)) : [];
        const options: UserOptions[] = this.props.group ? GroupManager.Instance.options.filter(option => !(JSON.parse(StrCast(this.props.group.members)) as string[]).includes(option.value)) : [];
        return (!this.props.group ? null :
            <div className="editing-interface">
                <div className="editing-header">
                    <b>{this.props.group.groupName}</b>
                    <div className={"memberView-closeButton"} onClick={action(this.props.onCloseButtonClick)}>
                        <FontAwesomeIcon icon={fa.faWindowClose} size={"lg"} />
                    </div>

                    {GroupManager.Instance.hasEditAccess(this.props.group) ?
                        <div className="group-buttons">
                            <div className="add-member-dropdown">
                                <Select
                                    isSearchable={true}
                                    options={options}
                                    onChange={selectedOption => GroupManager.Instance.addMemberToGroup(this.props.group, (selectedOption as UserOptions).value)}
                                    placeholder={"Add members"}
                                    value={null}
                                    closeMenuOnSelect={true}
                                />
                            </div>
                            <button onClick={() => console.log(GroupManager.Instance.deleteGroup(this.props.group))}>Delete group</button>
                        </div> :
                        null}
                </div>
                <div className="editing-contents">
                    {members.map(member => (
                        <div className="editing-row">
                            <div className="user-email">
                                {member}
                            </div>
                            {GroupManager.Instance.hasEditAccess(this.props.group) ? <button onClick={() => GroupManager.Instance.removeMemberFromGroup(this.props.group, member)}> Remove </button> : null}
                        </div>
                    ))}
                </div>
            </div>
        );

    }

    render() {
        return <MainViewModal
            isDisplayed={true}
            interactive={true}
            contents={this.editingInterface}
        />;
    }


}