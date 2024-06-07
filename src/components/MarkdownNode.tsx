import React, {useEffect, useState} from 'react'
import {Handle, Position, NodeProps, NodeResizeControl} from 'reactflow'
import {FiEdit, FiPlus, FiRefreshCcw, FiTrash2} from 'react-icons/fi'
import {Button, TextareaAutosize, Checkbox, Dialog, DialogActions, DialogTitle} from '@mui/material'

import {MarkdownViewer} from './markdown/MDPreview'
import {Box} from '@mui/material'

export interface MarkdownNodeData<T> {
	content: string
	message: T
	nodeType: 'answer' | 'question'
	isSelected: boolean
}

export interface MarkdownNodeProps<T> extends NodeProps {
	onEdit: (node: NodeProps<MarkdownNodeData<T>>) => void
	onDelete: (node: NodeProps<MarkdownNodeData<T>>) => void
	onAddQuestion: (node: NodeProps<MarkdownNodeData<T>>) => void
	submitQuestion: (node: NodeProps<MarkdownNodeData<T>>, questionContent: string) => void
	onRefresh: (node: NodeProps<MarkdownNodeData<T>>) => void
	isSelectable: boolean
	onCheckboxChange: (id: string, isSelected: boolean) => void
}

export const MarkdownNode = <T,>({
	onEdit,
	onDelete,
	onAddQuestion,
	submitQuestion,
	onRefresh,
	isSelectable,
	onCheckboxChange,
	...node
}: MarkdownNodeProps<T>) => {
	const {id, data} = node
	const [isHovered, setIsHovered] = useState(false)
	const [isEditable, setIsEditable] = useState(false)
	const [isTextarea, setIsTextarea] = useState(false)
	const [question, setQuestion] = useState('')
	const [confirmDeleteDialog, setConfirmDeleteDialog] = useState(false)

	const isQuestionNode = data.nodeType === 'question'

	const showConfirmDeleteDialog = () => {
		setConfirmDeleteDialog(true)
	}

	const closeConfirmDeleteDialog = () => {
		setConfirmDeleteDialog(false)
	}

	const sxStyles = {
		markdownNode: {
			position: 'relative',
			display:"flex", 
			alignItems:"start",
			padding: '12px',
			borderRadius: '8px',
			boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
			height: '100%',
			width: '100%',
			maxWidth: '800px',
			'& textarea': {
				width: '99%',
				height: '100%',
				border: 'none',
				resize: 'none',
				outline: 'none',
				minHeight: '30px',
				fontSize: '16px',
			},
		},
		nodeStyle: isQuestionNode
			? {
					background: '#e8f0fe',
					color: '#1a73e8',
					border: '1px solid #d2e3fc',
					'& svg': {
						cursor: 'pointer',
					},
			  }
			: {
					background: '#f1f3f4',
					color: '#202124',
					border: '1px solid #dadce0',
					'& svg': {
						color: '#202124',
					},
			  },
		markdownNodeContent: {
			padding: '7px',
		},
		markdownNodeActions: {
			position: 'absolute',
			top: '-20px',
			right: '-20px',
			display: 'flex',
			gap: '8px',
			background: 'rgba(255, 255, 255, 0.9)',
			borderRadius: '8px',
			padding: '5px',
			boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
			'& svg': {
				cursor: 'pointer',
			},
		},
		contentContainer: {
			overflow: 'auto',
			width: '100%',
			height: '100%',
			'&::-webkit-scrollbar': {
				width: '6px', // Adjust the width of the scrollbar
			},
			'&::-webkit-scrollbar-thumb': {
				backgroundColor: '#888', // Change the color of the scrollbar thumb
				borderRadius: '10px', // Round the corners of the scrollbar thumb
			},
			'&::-webkit-scrollbar-thumb:hover': {
				backgroundColor: '#555', // Change the color on hover
			},
			'&::-webkit-scrollbar-track': {
				backgroundColor: '#f1f1f1', // Change the background color of the scrollbar track
			},
		},
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			console.log('Enter key pressed!')
			submitQuestion(node, question)
			setIsTextarea(true)
			// Add your desired action here, such as submitting the content
		}
	}

	const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		onCheckboxChange(id, event.target.checked)
	}

	return (
		<>
			<Box
				sx={{...sxStyles.markdownNode, ...sxStyles?.nodeStyle}}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<NodeResizeControl minWidth={20} minHeight={20}></NodeResizeControl>
				{data?.isSelectable && (
					<Checkbox checked={data.isSelected} onChange={handleCheckboxChange} />
				)}
				<Box sx={sxStyles.contentContainer}>
					<Box sx={sxStyles.markdownNodeContent}>
						{isEditable ? (
							<TextareaAutosize minRows={3} defaultValue={data.content} />
						) : !data.content && data.nodeType === 'question' ? (
							<TextareaAutosize
								onKeyDown={handleKeyDown}
								onChange={e => setQuestion(e.target.value)}
								minRows={1}
								defaultValue={data.content}
							/>
						) : (
							<MarkdownViewer value={data.content || question} />
						)}
					</Box>
					{isHovered && (
						<Box sx={sxStyles.markdownNodeActions}>
							{data.nodeType !== 'question' ? (
								<>
									<FiPlus onClick={() => onAddQuestion(node)} />
									<FiRefreshCcw onClick={() => onRefresh(node)} />
								</>
							) : (
								<>
									<FiEdit onClick={() => setIsEditable(true)} />
									<FiTrash2 onClick={() => onDelete(node)} />
								</>
							)}
						</Box>
					)}
					<Handle type="source" position={Position.Top} />
					<Handle type="target" position={Position.Bottom} />
				</Box>
				<Dialog open={confirmDeleteDialog} onClose={closeConfirmDeleteDialog}>
					<DialogTitle>Are you sure to delete this conversation?</DialogTitle>
					<DialogActions>
						<Button onClick={closeConfirmDeleteDialog}>No</Button>
						<Button
							onClick={() => {
								onDelete(node)
								closeConfirmDeleteDialog()
							}}
						>
							Yes
						</Button>
					</DialogActions>
				</Dialog>
			</Box>
		</>
	)
}

export const MarkdownNodeType = {markdownNode: MarkdownNode}
