from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from models import db, Period
from datetime import date

periods_bp = Blueprint('periods', __name__)

@periods_bp.route('/', methods=['GET'])
@jwt_required()
def get_periods():
    claims = get_jwt()
    school_id = claims.get('school_id')
    year = request.args.get('year', date.today().year, type=int)
    periods = Period.query.filter_by(school_id=school_id, year=year).order_by(Period.number).all()
    return jsonify([p.to_dict() for p in periods]), 200

@periods_bp.route('/', methods=['POST'])
@jwt_required()
def create_period():
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    school_id = claims.get('school_id')
    data = request.get_json()
    period = Period(
        school_id=school_id, name=data['name'],
        period_type=data['period_type'], year=data['year'],
        number=data.get('number', 1),
        start_date=date.fromisoformat(data['start_date']) if data.get('start_date') else None,
        end_date=date.fromisoformat(data['end_date']) if data.get('end_date') else None,
        is_active=data.get('is_active', True)
    )
    db.session.add(period)
    db.session.commit()
    return jsonify(period.to_dict()), 201

@periods_bp.route('/<int:period_id>', methods=['PUT'])
@jwt_required()
def update_period(period_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    period = Period.query.filter_by(id=period_id, school_id=claims.get('school_id')).first_or_404()
    data = request.get_json()
    for field in ['name', 'period_type', 'year', 'number', 'is_active']:
        if field in data:
            setattr(period, field, data[field])
    if data.get('start_date'):
        period.start_date = date.fromisoformat(data['start_date'])
    if data.get('end_date'):
        period.end_date = date.fromisoformat(data['end_date'])
    db.session.commit()
    return jsonify(period.to_dict()), 200

@periods_bp.route('/<int:period_id>', methods=['DELETE'])
@jwt_required()
def delete_period(period_id):
    claims = get_jwt()
    if claims.get('role') not in ['admin', 'directivo']:
        return jsonify({'error': 'Sin permisos'}), 403
    period = Period.query.filter_by(id=period_id, school_id=claims.get('school_id')).first_or_404()
    db.session.delete(period)
    db.session.commit()
    return jsonify({'message': 'Período eliminado'}), 200
